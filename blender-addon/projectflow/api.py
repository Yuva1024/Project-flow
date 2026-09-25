"""HTTP client for the ProjectFlow API.

Uses ``urllib`` from the standard library on purpose. Blender ships its own
Python without ``requests``, and installing packages into it is both awkward and
blocked outright inside the 4.2+ extension sandbox.

Nothing in this module may touch ``bpy``. Every function here runs on a worker
thread, and reading or writing Blender data off the main thread segfaults the
process rather than raising.
"""

from __future__ import annotations

import json
import socket
import urllib.error
import urllib.parse
import urllib.request
import threading
from typing import Any, Callable, Dict, Iterator, List, Optional

USER_AGENT = "ProjectFlow-Blender/0.1.0"

# The free Render tier stops the service after ~15 minutes of no traffic and a
# cold start takes 30-60s. The first call of a session therefore gets a long
# budget; once something has answered we drop to a normal timeout so genuine
# failures surface quickly instead of hanging the UI for a minute.
COLD_TIMEOUT = 120.0
WARM_TIMEOUT = 20.0

# Downloads come from R2, which never sleeps, but the files can be large.
DOWNLOAD_TIMEOUT = 300.0


class ApiError(Exception):
    """Base class for every failure this module raises."""

    def __init__(self, message: str, status: Optional[int] = None):
        super().__init__(message)
        self.message = message
        self.status = status


class AuthError(ApiError):
    """401 — the token is missing, expired or revoked. Stop and re-authenticate."""


class ForbiddenError(ApiError):
    """403 — authenticated, but not a member of the workspace being addressed."""


class RateLimitError(ApiError):
    """429 — back off. The server's own message explains for how long."""


class NetworkError(ApiError):
    """DNS failure, refused connection, TLS problem or timeout."""


class ServerError(ApiError):
    """5xx. On the free tier this is often a cold start that outlasted the timeout."""


def _decode_error_body(raw: bytes) -> str:
    """Pulls the server's ``message`` field out of an error response if present."""
    try:
        payload = json.loads(raw.decode("utf-8"))
    except (ValueError, UnicodeDecodeError):
        return ""
    if isinstance(payload, dict):
        message = payload.get("message")
        if isinstance(message, str):
            return message
    return ""


class ApiClient:
    """A thin, synchronous client bound to one server URL and one token."""

    def __init__(self, base_url: str, token: Optional[str] = None):
        self.base_url = base_url.rstrip("/")
        self.token = token
        # Flipped once anything answers, so the next call stops budgeting for a
        # cold start. Reset by callers when the connection looks dead again.
        self.warm = False

    # -- request plumbing --------------------------------------------------

    def _url(self, path: str, params: Optional[Dict[str, Any]] = None) -> str:
        url = f"{self.base_url}{path}"
        if params:
            clean = {k: v for k, v in params.items() if v is not None and v != ""}
            if clean:
                url = f"{url}?{urllib.parse.urlencode(clean)}"
        return url

    def _headers(self, extra: Optional[Dict[str, str]] = None) -> Dict[str, str]:
        headers = {"User-Agent": USER_AGENT, "Accept": "application/json"}
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        if extra:
            headers.update(extra)
        return headers

    def request(
        self,
        method: str,
        path: str,
        params: Optional[Dict[str, Any]] = None,
        body: Optional[Dict[str, Any]] = None,
        timeout: Optional[float] = None,
    ) -> Any:
        """Performs one API call and returns the decoded JSON body."""
        url = self._url(path, params)
        data = None
        headers: Dict[str, str] = {}

        if body is not None:
            data = json.dumps(body).encode("utf-8")
            headers["Content-Type"] = "application/json"

        if timeout is None:
            timeout = WARM_TIMEOUT if self.warm else COLD_TIMEOUT

        req = urllib.request.Request(
            url, data=data, headers=self._headers(headers), method=method
        )

        try:
            with urllib.request.urlopen(req, timeout=timeout) as response:
                self.warm = True
                raw = response.read()
                if not raw:
                    return None
                return json.loads(raw.decode("utf-8"))

        except urllib.error.HTTPError as exc:
            # The server answered, so the service is awake even though this call failed.
            self.warm = True
            raise self._map_http_error(exc) from exc

        except socket.timeout as exc:
            raise NetworkError(
                "The server did not respond in time. On the free tier the first "
                "request after a quiet period can take up to a minute."
            ) from exc

        except urllib.error.URLError as exc:
            raise NetworkError(f"Could not reach {self.base_url}: {exc.reason}") from exc

        except (ValueError, UnicodeDecodeError) as exc:
            raise ApiError("The server returned a response that could not be read.") from exc

    @staticmethod
    def _map_http_error(exc: urllib.error.HTTPError) -> ApiError:
        """Turns an HTTP status into the exception the caller should react to."""
        try:
            raw = exc.read()
        except Exception:  # noqa: BLE001 - the body is best-effort context only
            raw = b""

        message = _decode_error_body(raw)
        status = exc.code

        if status == 401:
            return AuthError(
                message or "Your access token is no longer valid. Sign in again.", status
            )
        if status == 403:
            return ForbiddenError(
                message or "You do not have access to this workspace.", status
            )
        if status == 404:
            return ApiError(message or "Not found.", status)
        if status == 429:
            return RateLimitError(message or "Too many requests. Wait a moment.", status)
        if status >= 500:
            return ServerError(
                message or f"The server returned an error ({status}).", status
            )
        return ApiError(message or f"Request failed ({status}).", status)

    # -- auth --------------------------------------------------------------

    def health(self) -> Any:
        """Unauthenticated ping.

        ``/api/health`` is registered before the rate limiter on the server and
        does not touch the database, which makes it the right way to wake a
        sleeping instance before the user asks for anything.
        """
        return self.request("GET", "/api/health", timeout=COLD_TIMEOUT)

    def me(self) -> Dict[str, Any]:
        payload = self.request("GET", "/api/auth/me")
        return payload.get("user", {}) if isinstance(payload, dict) else {}

    def login(self, email: str, password: str) -> Dict[str, Any]:
        """Exchanges a password for a session JWT.

        Only used to mint a personal access token from inside Blender. The
        password is never stored, and the JWT is discarded immediately after.
        """
        return self.request(
            "POST", "/api/auth/login", body={"email": email, "password": password}
        )

    def create_access_token(self, label: str) -> Dict[str, Any]:
        return self.request("POST", "/api/auth/tokens", body={"label": label})

    # -- workspaces --------------------------------------------------------

    def workspaces(self) -> List[Dict[str, Any]]:
        payload = self.request("GET", "/api/workspaces")
        return payload if isinstance(payload, list) else []

    # -- asset library -----------------------------------------------------

    def asset_folders(self, workspace_id: str) -> List[Dict[str, Any]]:
        payload = self.request("GET", f"/api/workspaces/{workspace_id}/assets/folders")
        return payload if isinstance(payload, list) else []

    def asset_tags(self, workspace_id: str) -> List[Dict[str, Any]]:
        payload = self.request("GET", f"/api/workspaces/{workspace_id}/assets/tags")
        return payload if isinstance(payload, list) else []

    def iter_assets(
        self,
        workspace_id: str,
        mime_type: Optional[str] = "3d",
        folder_id: Optional[str] = None,
        search: Optional[str] = None,
        page_size: int = 50,
    ) -> Iterator[Dict[str, Any]]:
        """Yields every matching asset, following pagination.

        The list response already embeds tags, folder and uploader, so a sync
        never needs a per-asset detail call. That matters: the server allows 300
        requests a minute, and a library of a few hundred assets would blow
        straight through it one request at a time.
        """
        page = 1
        seen = 0
        while True:
            payload = self.request(
                "GET",
                f"/api/workspaces/{workspace_id}/assets",
                params={
                    "mimeType": mime_type,
                    "folderId": folder_id,
                    "search": search,
                    "page": page,
                    "limit": page_size,
                },
            )
            if not isinstance(payload, dict):
                return

            assets = payload.get("assets") or []
            for asset in assets:
                yield asset

            seen += len(assets)
            total = payload.get("total") or 0
            if not assets or seen >= total:
                return
            page += 1

    def link_asset_to_card(
        self, workspace_id: str, board_id: str, card_id: str, asset_id: str
    ) -> Dict[str, Any]:
        return self.request(
            "POST",
            f"/api/workspaces/{workspace_id}/boards/{board_id}"
            f"/cards/{card_id}/attachments/link-asset/{asset_id}",
        )

    # -- boards ------------------------------------------------------------

    def boards(self, workspace_id: str) -> List[Dict[str, Any]]:
        payload = self.request("GET", f"/api/workspaces/{workspace_id}/boards")
        return payload if isinstance(payload, list) else []

    def board(self, workspace_id: str, board_id: str) -> Dict[str, Any]:
        """Returns the whole board: lists in order, each with its cards.

        One request covers the entire panel, including each card's labels and
        members.
        """
        return self.request("GET", f"/api/workspaces/{workspace_id}/boards/{board_id}")

    def move_card(
        self, workspace_id: str, board_id: str, card_id: str, target_list_id: str
    ) -> Dict[str, Any]:
        """Moves a card to another list.

        Uses the card update route rather than the reorder route: position
        within a stage carries no meaning in a pipeline, and this avoids having
        to compute a target index.
        """
        return self.request(
            "PATCH",
            f"/api/workspaces/{workspace_id}/boards/{board_id}/cards/{card_id}",
            body={"listId": target_list_id},
        )

    def card_attachments(
        self, workspace_id: str, board_id: str, card_id: str
    ) -> List[Dict[str, Any]]:
        payload = self.request(
            "GET",
            f"/api/workspaces/{workspace_id}/boards/{board_id}"
            f"/cards/{card_id}/attachments",
        )
        return payload if isinstance(payload, list) else []

    def card_activity(
        self, workspace_id: str, board_id: str, card_id: str
    ) -> List[Dict[str, Any]]:
        payload = self.request(
            "GET",
            f"/api/workspaces/{workspace_id}/boards/{board_id}/cards/{card_id}/activity",
        )
        return payload if isinstance(payload, list) else []

    def card_checklists(
        self, workspace_id: str, board_id: str, card_id: str
    ) -> List[Dict[str, Any]]:
        payload = self.request(
            "GET",
            f"/api/workspaces/{workspace_id}/boards/{board_id}/cards/{card_id}/checklists",
        )
        return payload if isinstance(payload, list) else []

    def set_checklist_item(
        self,
        workspace_id: str,
        board_id: str,
        card_id: str,
        checklist_id: str,
        item_id: str,
        is_checked: bool,
    ) -> Dict[str, Any]:
        return self.request(
            "PATCH",
            f"/api/workspaces/{workspace_id}/boards/{board_id}/cards/{card_id}"
            f"/checklists/{checklist_id}/items/{item_id}",
            body={"isChecked": is_checked},
        )

    def add_comment(
        self, workspace_id: str, board_id: str, card_id: str, content: str
    ) -> Dict[str, Any]:
        return self.request(
            "POST",
            f"/api/workspaces/{workspace_id}/boards/{board_id}/cards/{card_id}/comments",
            body={"content": content},
        )

    # -- uploads -----------------------------------------------------------

    def upload_card_attachment(
        self,
        workspace_id: str,
        board_id: str,
        card_id: str,
        file_path: str,
        progress: Optional[Callable[[int, int], None]] = None,
        cancel: Optional[threading.Event] = None,
    ) -> Dict[str, Any]:
        return self._upload(
            f"/api/workspaces/{workspace_id}/boards/{board_id}"
            f"/cards/{card_id}/attachments",
            file_path,
            progress=progress,
            cancel=cancel,
        )

    def upload_attachment_preview(
        self,
        workspace_id: str,
        board_id: str,
        card_id: str,
        attachment_id: str,
        file_path: str,
    ) -> Dict[str, Any]:
        """Pairs a renderable GLB with an attachment the web viewer cannot read.

        Attaches to the existing row rather than creating a second one, so the
        card shows one file: the FBX downloads, the GLB is what renders.
        """
        return self._upload(
            f"/api/workspaces/{workspace_id}/boards/{board_id}"
            f"/cards/{card_id}/attachments/{attachment_id}/preview",
            file_path,
        )

    def _upload(
        self,
        path: str,
        file_path: str,
        fields: Optional[Dict[str, str]] = None,
        progress: Optional[Callable[[int, int], None]] = None,
        cancel: Optional[threading.Event] = None,
    ) -> Any:
        """Posts a file as multipart/form-data, streamed from disk.

        This used to read the whole file into memory and then build the request
        body as a second copy — a 200 MB export meant ~400 MB resident, and a
        dialog that sat on "Uploading…" with no sign of progress and no way out.
        The body is now produced in chunks as the socket accepts them, with a
        known Content-Length, so memory stays flat, ``progress(sent, total)`` is
        called as bytes go out, and setting ``cancel`` aborts between chunks.
        """
        body, content_type, total = build_multipart(
            file_path, fields=fields, progress=progress, cancel=cancel
        )

        req = urllib.request.Request(
            self._url(path),
            data=body,
            headers=self._headers(
                {"Content-Type": content_type, "Content-Length": str(total)}
            ),
            method="POST",
        )

        try:
            with urllib.request.urlopen(req, timeout=DOWNLOAD_TIMEOUT) as response:
                self.warm = True
                raw = response.read()
                return json.loads(raw.decode("utf-8")) if raw else None
        except UploadCancelled:
            raise
        except urllib.error.HTTPError as exc:
            self.warm = True
            raise self._map_http_error(exc) from exc
        except socket.timeout as exc:
            raise NetworkError("The upload timed out.") from exc
        except urllib.error.URLError as exc:
            # urllib wraps errors raised while sending the body, including our
            # own cancellation; unwrap that so the caller can tell them apart.
            if isinstance(exc.reason, UploadCancelled):
                raise exc.reason from None
            raise NetworkError(f"Upload failed: {exc.reason}") from exc
        except OSError as exc:
            if cancel is not None and cancel.is_set():
                raise UploadCancelled("Upload cancelled.") from exc
            raise NetworkError(f"Upload failed: {exc}") from exc


class UploadCancelled(ApiError):
    """Raised when an upload is stopped by the user part-way through."""


#: Bytes read from disk per chunk while streaming an upload.
UPLOAD_CHUNK = 1 << 20


def build_multipart(
    file_path: str,
    fields: Optional[Dict[str, str]] = None,
    progress: Optional[Callable[[int, int], None]] = None,
    cancel: Optional[threading.Event] = None,
    boundary: Optional[str] = None,
):
    """Returns ``(iterable_body, content_type, content_length)`` for a file upload.

    The body is a generator, so the file is read one chunk at a time while it is
    being sent. The exact length is computed up front from the file size so the
    request carries a Content-Length rather than falling back to chunked
    transfer encoding.
    """
    import mimetypes
    import os
    import uuid as _uuid

    boundary = boundary or f"----ProjectFlow{_uuid.uuid4().hex}"
    filename = os.path.basename(file_path)
    # A quote or newline in the filename would break the header it sits in.
    safe_name = filename.replace('"', "'").replace("\r", " ").replace("\n", " ")
    file_type = mimetypes.guess_type(filename)[0] or "application/octet-stream"

    head = b""
    for key, value in (fields or {}).items():
        if value is None:
            continue
        head += (
            f"--{boundary}\r\n"
            f'Content-Disposition: form-data; name="{key}"\r\n\r\n'
            f"{value}\r\n"
        ).encode("utf-8")
    head += (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="file"; filename="{safe_name}"\r\n'
        f"Content-Type: {file_type}\r\n\r\n"
    ).encode("utf-8")
    tail = f"\r\n--{boundary}--\r\n".encode("utf-8")

    file_size = os.path.getsize(file_path)
    total = len(head) + file_size + len(tail)

    def generate():
        sent = 0

        def report(n: int) -> None:
            nonlocal sent
            sent += n
            if progress is not None:
                progress(sent, total)

        yield head
        report(len(head))

        with open(file_path, "rb") as handle:
            while True:
                if cancel is not None and cancel.is_set():
                    raise UploadCancelled("Upload cancelled.")
                chunk = handle.read(UPLOAD_CHUNK)
                if not chunk:
                    break
                yield chunk
                report(len(chunk))

        yield tail
        report(len(tail))

    return generate(), f"multipart/form-data; boundary={boundary}", total


def download_file(url: str, destination: str, chunk_size: int = 1 << 20) -> int:
    """Streams a URL to disk and returns the number of bytes written.

    Asset bytes come straight from R2 rather than through the API: R2 never
    sleeps, its egress is free, and routing gigabytes through a free-tier web
    service would be slow at best. No auth header is sent because the bucket is
    served publicly.

    Writes to a temporary file first so an interrupted download cannot leave a
    truncated file sitting in the cache under a hash that says it is complete.
    """
    import os
    import shutil

    temp_path = f"{destination}.part"
    os.makedirs(os.path.dirname(destination), exist_ok=True)

    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})

    try:
        with urllib.request.urlopen(req, timeout=DOWNLOAD_TIMEOUT) as response:
            with open(temp_path, "wb") as handle:
                shutil.copyfileobj(response, handle, chunk_size)
    except urllib.error.HTTPError as exc:
        _cleanup(temp_path)
        raise ApiError(f"Download failed ({exc.code}) for {url}", exc.code) from exc
    except (urllib.error.URLError, socket.timeout) as exc:
        _cleanup(temp_path)
        raise NetworkError(f"Download failed: {exc}") from exc
    except OSError as exc:
        _cleanup(temp_path)
        raise ApiError(f"Could not write to the cache: {exc}") from exc

    os.replace(temp_path, destination)
    return os.path.getsize(destination)


def _cleanup(path: str) -> None:
    import os

    try:
        os.remove(path)
    except OSError:
        pass

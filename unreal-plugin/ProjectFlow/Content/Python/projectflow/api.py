"""HTTP client for the ProjectFlow API.

Deliberately a near-copy of the Blender add-on's client, for two reasons: the
server is the same, and keeping the two shaped alike means a fix to one is
obvious to apply to the other.

Standard library only. Unreal ships its own Python and ``requests`` is not
guaranteed to be present, so ``urllib`` it is.

Nothing here imports ``unreal``. That keeps the module testable outside the
editor and makes it safe to call from a worker thread, where touching the
engine API is not.
"""

from __future__ import annotations

import json
import socket
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Dict, Iterator, List, Optional

USER_AGENT = "ProjectFlow-Unreal/0.1.0"

# The backend runs on Render's free tier, which stops the service after ~15
# minutes of no traffic; waking it takes 30-60s. The first call of a session
# gets a long budget, and everything after it a normal one.
COLD_TIMEOUT = 120.0
WARM_TIMEOUT = 20.0
DOWNLOAD_TIMEOUT = 600.0


class ApiError(Exception):
    def __init__(self, message: str, status: Optional[int] = None):
        super().__init__(message)
        self.message = message
        self.status = status


class AuthError(ApiError):
    """401 - token missing, expired or revoked."""


class ForbiddenError(ApiError):
    """403 - authenticated but not a member of that workspace."""


class RateLimitError(ApiError):
    """429 - back off."""


class NetworkError(ApiError):
    """DNS, connection, TLS or timeout failure."""


class ServerError(ApiError):
    """5xx. On the free tier this is often a cold start that outlasted the timeout."""


def _error_message(raw: bytes) -> str:
    try:
        payload = json.loads(raw.decode("utf-8"))
    except (ValueError, UnicodeDecodeError):
        return ""
    return payload.get("message", "") if isinstance(payload, dict) else ""


class ApiClient:
    def __init__(self, base_url: str, token: Optional[str] = None):
        self.base_url = (base_url or "").rstrip("/")
        self.token = token
        self.warm = False

    # -- plumbing ----------------------------------------------------------

    def _url(self, path: str, params: Optional[Dict[str, Any]] = None) -> str:
        url = f"{self.base_url}{path}"
        if params:
            clean = {k: v for k, v in params.items() if v not in (None, "")}
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
        url = self._url(path, params)
        data = None
        extra: Dict[str, str] = {}

        if body is not None:
            data = json.dumps(body).encode("utf-8")
            extra["Content-Type"] = "application/json"

        if timeout is None:
            timeout = WARM_TIMEOUT if self.warm else COLD_TIMEOUT

        req = urllib.request.Request(
            url, data=data, headers=self._headers(extra), method=method
        )

        try:
            with urllib.request.urlopen(req, timeout=timeout) as response:
                self.warm = True
                raw = response.read()
                return json.loads(raw.decode("utf-8")) if raw else None

        except urllib.error.HTTPError as exc:
            self.warm = True
            raise self._map_error(exc) from exc
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
    def _map_error(exc: urllib.error.HTTPError) -> ApiError:
        try:
            raw = exc.read()
        except Exception:  # noqa: BLE001
            raw = b""
        message = _error_message(raw)
        status = exc.code

        if status == 401:
            return AuthError(message or "Your access token is no longer valid.", status)
        if status == 403:
            return ForbiddenError(message or "You do not have access to that workspace.", status)
        if status == 404:
            return ApiError(message or "Not found.", status)
        if status == 429:
            return RateLimitError(message or "Too many requests. Wait a moment.", status)
        if status >= 500:
            return ServerError(message or f"Server error ({status}).", status)
        return ApiError(message or f"Request failed ({status}).", status)

    # -- endpoints ---------------------------------------------------------

    def health(self) -> Any:
        """Unauthenticated ping that wakes a sleeping instance.

        Registered before the rate limiter on the server and touches no
        database, which makes it the right thing to call first.
        """
        return self.request("GET", "/api/health", timeout=COLD_TIMEOUT)

    def me(self) -> Dict[str, Any]:
        payload = self.request("GET", "/api/auth/me")
        return payload.get("user", {}) if isinstance(payload, dict) else {}

    def workspaces(self) -> List[Dict[str, Any]]:
        payload = self.request("GET", "/api/workspaces")
        return payload if isinstance(payload, list) else []

    # -- asset library -----------------------------------------------------

    def asset_folders(self, workspace_id: str) -> List[Dict[str, Any]]:
        payload = self.request("GET", f"/api/workspaces/{workspace_id}/assets/folders")
        return payload if isinstance(payload, list) else []

    def iter_assets(
        self,
        workspace_id: str,
        mime_type: Optional[str] = "3d",
        page_size: int = 50,
    ) -> Iterator[Dict[str, Any]]:
        """Yields every matching asset, following pagination.

        The list response embeds tags, folder and uploader, so a full browse
        never needs a per-asset call. That matters: the server allows 300
        requests a minute.
        """
        page = 1
        seen = 0
        while True:
            payload = self.request(
                "GET",
                f"/api/workspaces/{workspace_id}/assets",
                params={"mimeType": mime_type, "page": page, "limit": page_size},
            )
            if not isinstance(payload, dict):
                return
            assets = payload.get("assets") or []
            for asset in assets:
                yield asset
            seen += len(assets)
            if not assets or seen >= (payload.get("total") or 0):
                return
            page += 1

    # -- boards ------------------------------------------------------------

    def boards(self, workspace_id: str) -> List[Dict[str, Any]]:
        payload = self.request("GET", f"/api/workspaces/{workspace_id}/boards")
        return payload if isinstance(payload, list) else []

    def board(self, workspace_id: str, board_id: str) -> Dict[str, Any]:
        """The whole board: sections in order, each with its cards."""
        return self.request("GET", f"/api/workspaces/{workspace_id}/boards/{board_id}")

    def card_attachments(
        self, workspace_id: str, board_id: str, card_id: str
    ) -> List[Dict[str, Any]]:
        payload = self.request(
            "GET",
            f"/api/workspaces/{workspace_id}/boards/{board_id}/cards/{card_id}/attachments",
        )
        return payload if isinstance(payload, list) else []

    def add_comment(
        self, workspace_id: str, board_id: str, card_id: str, content: str
    ) -> Dict[str, Any]:
        return self.request(
            "POST",
            f"/api/workspaces/{workspace_id}/boards/{board_id}/cards/{card_id}/comments",
            body={"content": content},
        )

    def move_card(
        self, workspace_id: str, board_id: str, card_id: str, target_list_id: str
    ) -> Dict[str, Any]:
        return self.request(
            "PATCH",
            f"/api/workspaces/{workspace_id}/boards/{board_id}/cards/{card_id}",
            body={"listId": target_list_id},
        )


def download_file(url: str, destination: str, progress=None) -> int:
    """Streams a URL to disk, returning bytes written.

    Asset bytes come straight from R2 rather than through the API: R2 never
    sleeps, its egress is free, and routing gigabytes through a free-tier web
    service would be slow at best.

    Writes to a temporary file first so an interrupted download cannot leave a
    truncated file sitting under a name that says it is complete.
    """
    import os
    import shutil

    temp_path = f"{destination}.part"
    os.makedirs(os.path.dirname(destination), exist_ok=True)

    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})

    try:
        with urllib.request.urlopen(req, timeout=DOWNLOAD_TIMEOUT) as response:
            total = int(response.headers.get("Content-Length") or 0)
            written = 0
            with open(temp_path, "wb") as handle:
                while True:
                    chunk = response.read(1 << 20)
                    if not chunk:
                        break
                    handle.write(chunk)
                    written += len(chunk)
                    if progress and total:
                        progress(written / total)
    except urllib.error.HTTPError as exc:
        _remove(temp_path)
        raise ApiError(f"Download failed ({exc.code}) for {url}", exc.code) from exc
    except (urllib.error.URLError, socket.timeout) as exc:
        _remove(temp_path)
        raise NetworkError(f"Download failed: {exc}") from exc
    except OSError as exc:
        _remove(temp_path)
        raise ApiError(f"Could not write to the cache: {exc}") from exc

    import os as _os

    _os.replace(temp_path, destination)
    return _os.path.getsize(destination)


def _remove(path: str) -> None:
    import os

    try:
        os.remove(path)
    except OSError:
        pass

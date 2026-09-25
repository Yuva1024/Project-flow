"""Sign-in, sign-out and token validation.

The add-on authenticates with a personal access token, never a stored password.
Two ways to get one:

* **Sign In** — a transient dialog takes an email and password, exchanges them
  for a session JWT, immediately uses that to mint a named access token, and
  discards both the password and the JWT. The password exists only for the life
  of the operator call.
* **Paste an Access Token** — for a token generated on the website.

Either way, only the access token is persisted, and it can be revoked from the
web UI without touching the account password.
"""

from __future__ import annotations

import platform

import bpy
from bpy.props import StringProperty
from bpy.types import Operator

from . import api, properties, session, tasks
from .preferences import get_preferences


def make_client(context=None, token=None) -> api.ApiClient:
    prefs = get_preferences(context)
    return api.ApiClient(prefs.server_url, token if token is not None else session.load_token())


def report_api_error(operator_or_none, exc: BaseException) -> str:
    """Turns an exception into a message worth showing, and handles 401 globally."""
    if isinstance(exc, api.AuthError):
        # The token is dead. Clear it so the UI stops claiming we are signed in.
        session.state.sign_out()
        message = "Your access token is no longer valid. Sign in again."
    elif isinstance(exc, api.ForbiddenError):
        message = exc.message or "You do not have access to that workspace."
    elif isinstance(exc, api.RateLimitError):
        message = exc.message or "Too many requests. Wait a moment and retry."
    elif isinstance(exc, api.NetworkError):
        message = str(exc)
    elif isinstance(exc, api.ApiError):
        message = exc.message
    else:
        message = str(exc)

    session.state.error = message
    if operator_or_none is not None:
        operator_or_none.report({"ERROR"}, message)
    return message


def check_online_access(operator) -> bool:
    """Blender 4.2+ blocks extension networking behind a global preference."""
    if bpy.app.online_access:
        return True
    operator.report(
        {"ERROR"},
        "Online access is disabled. Enable it in Preferences > System > Network.",
    )
    return False


class PROJECTFLOW_OT_sign_in(Operator):
    bl_idname = "projectflow.sign_in"
    bl_label = "Sign In to ProjectFlow"
    bl_description = "Exchange your password for a long-lived access token"
    bl_options = {"REGISTER", "INTERNAL"}

    email: StringProperty(name="Email", description="Your ProjectFlow account email")

    # subtype='PASSWORD' masks the field in the dialog. It is NOT storage
    # protection — which is exactly why this value is never written anywhere.
    password: StringProperty(
        name="Password",
        description="Used once to mint an access token, then discarded",
        subtype="PASSWORD",
    )

    token_label: StringProperty(
        name="Device Name",
        description="How this machine appears in your token list on the website",
        default="",
    )

    def invoke(self, context, event):
        if not check_online_access(self):
            return {"CANCELLED"}
        if not self.token_label:
            self.token_label = f"Blender on {platform.node() or 'this machine'}"
        return context.window_manager.invoke_props_dialog(self, width=360)

    def draw(self, context):
        layout = self.layout
        col = layout.column()
        col.use_property_split = True
        col.prop(self, "email")
        col.prop(self, "password")
        col.prop(self, "token_label")

        info = layout.box()
        info.scale_y = 0.8
        info.label(text="Your password is used once and never stored.", icon="LOCKED")
        info.label(text=f"The token is kept in: {session.storage_backend()}")

    def execute(self, context):
        if not self.email or not self.password:
            self.report({"ERROR"}, "Enter both your email and password.")
            return {"CANCELLED"}

        prefs = get_preferences(context)
        server_url = prefs.server_url
        email = self.email
        password = self.password
        label = self.token_label or "Blender"

        # Clear the password from the operator now. It still lives in the local
        # below until the thread finishes, but nothing persists it and the
        # operator instance will not hold it if Blender redraws the dialog.
        self.password = ""

        session.state.checking = True
        session.state.error = ""
        session.state.status = "Signing in…"
        tasks.redraw_ui()

        def work():
            client = api.ApiClient(server_url)
            # Wakes a sleeping free-tier instance before the timed call that matters.
            try:
                client.health()
            except api.ApiError:
                pass

            login = client.login(email, password)
            jwt = (login or {}).get("token")
            if not jwt:
                raise api.ApiError("The server did not return a session token.")

            client.token = jwt
            created = client.create_access_token(label)
            token = (created or {}).get("token")
            if not token:
                raise api.ApiError("The server did not return an access token.")

            # Confirm the new token actually authenticates before we store it.
            verify = api.ApiClient(server_url, token)
            user = verify.me()
            return {"token": token, "user": user}

        def done(result):
            session.state.checking = False
            session.save_token(result["token"])
            session.state.user = result["user"]
            session.state.status = ""
            session.state.error = ""
            tasks.redraw_ui()

        def failed(exc):
            session.state.checking = False
            session.state.status = ""
            report_api_error(None, exc)
            print(f"[ProjectFlow] Sign-in failed: {exc}")
            tasks.redraw_ui()

        tasks.run("sign-in", "Signing in", work, done, failed, replace=True)
        self.report({"INFO"}, "Signing in…")
        return {"FINISHED"}


class PROJECTFLOW_OT_paste_token(Operator):
    bl_idname = "projectflow.paste_token"
    bl_label = "Paste Access Token"
    bl_description = "Use a token generated on the ProjectFlow website"
    bl_options = {"REGISTER", "INTERNAL"}

    token: StringProperty(
        name="Access Token",
        description="Starts with pf_",
        subtype="PASSWORD",
    )

    def invoke(self, context, event):
        if not check_online_access(self):
            return {"CANCELLED"}
        return context.window_manager.invoke_props_dialog(self, width=420)

    def draw(self, context):
        layout = self.layout
        layout.prop(self, "token")
        info = layout.box()
        info.scale_y = 0.8
        info.label(text="Website: profile icon > My Settings > Access Tokens.")

    def execute(self, context):
        token = (self.token or "").strip()
        self.token = ""

        if not token:
            self.report({"ERROR"}, "Paste a token first.")
            return {"CANCELLED"}
        if not token.startswith("pf_"):
            self.report({"ERROR"}, "That does not look like an access token (expected pf_…).")
            return {"CANCELLED"}

        prefs = get_preferences(context)
        server_url = prefs.server_url

        session.state.checking = True
        session.state.error = ""
        tasks.redraw_ui()

        def work():
            client = api.ApiClient(server_url, token)
            try:
                client.health()
            except api.ApiError:
                pass
            return {"token": token, "user": client.me()}

        def done(result):
            session.state.checking = False
            session.save_token(result["token"])
            session.state.user = result["user"]
            session.state.error = ""
            tasks.redraw_ui()

        def failed(exc):
            session.state.checking = False
            report_api_error(None, exc)
            tasks.redraw_ui()

        tasks.run("verify-token", "Verifying token", work, done, failed, replace=True)
        self.report({"INFO"}, "Verifying token…")
        return {"FINISHED"}


class PROJECTFLOW_OT_sign_out(Operator):
    bl_idname = "projectflow.sign_out"
    bl_label = "Sign Out"
    bl_description = "Forget the stored access token on this machine"
    bl_options = {"REGISTER", "INTERNAL"}

    def execute(self, context):
        session.state.sign_out()
        properties.clear_caches()
        from . import ops_attachments

        ops_attachments.clear_caches()

        props = getattr(context.window_manager, "projectflow", None)
        if props:
            props.cards.clear()
            props.status = ""
            props.last_error = ""

        self.report({"INFO"}, "Signed out. The token was removed from this machine.")
        tasks.redraw_ui()
        return {"FINISHED"}


class PROJECTFLOW_OT_refresh_session(Operator):
    """Validates the stored token and wakes the server.

    Run automatically the first time the panel is drawn, so the free-tier cold
    start happens while the user is still reading the panel rather than when
    they click something.
    """

    bl_idname = "projectflow.refresh_session"
    bl_label = "Reconnect"
    bl_description = "Check the stored token and wake the server"
    bl_options = {"REGISTER", "INTERNAL"}

    def execute(self, context):
        if not bpy.app.online_access:
            session.state.error = "Online access is disabled in Preferences > System."
            return {"CANCELLED"}

        token = session.load_token()
        if not token:
            session.state.user = None
            return {"CANCELLED"}

        prefs = get_preferences(context)
        server_url = prefs.server_url

        session.state.checking = True
        session.state.error = ""
        tasks.redraw_ui()

        def work():
            client = api.ApiClient(server_url, token)
            try:
                client.health()
                warm = True
            except api.ApiError:
                warm = False
            return {"user": client.me(), "warm": warm}

        def done(result):
            session.state.checking = False
            session.state.user = result["user"]
            session.state.server_warm = result["warm"]
            session.state.error = ""
            tasks.redraw_ui()

        def failed(exc):
            session.state.checking = False
            report_api_error(None, exc)
            tasks.redraw_ui()

        tasks.run("session", "Connecting", work, done, failed, replace=True)
        return {"FINISHED"}


classes = (
    PROJECTFLOW_OT_sign_in,
    PROJECTFLOW_OT_paste_token,
    PROJECTFLOW_OT_sign_out,
    PROJECTFLOW_OT_refresh_session,
)


def register() -> None:
    for cls in classes:
        bpy.utils.register_class(cls)


def unregister() -> None:
    for cls in reversed(classes):
        bpy.utils.unregister_class(cls)

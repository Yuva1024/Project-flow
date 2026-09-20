"""Runs network work off the main thread without touching Blender data from it.

The rule this module exists to enforce: **only the main thread may touch bpy**.
Reading or writing Blender data from a worker thread does not raise an
exception, it segfaults the process, and the crash usually surfaces somewhere
unrelated. So worker threads here are handed plain callables that deal in
ordinary Python values, and their results are pushed onto a queue that a
``bpy.app.timers`` callback drains on the main thread.

``bpy.app.timers`` is used rather than a modal operator because it needs no
window context, survives the user clicking elsewhere, and does not hold a modal
grab on the UI.
"""

from __future__ import annotations

import queue
import threading
import traceback
from typing import Any, Callable, Dict, List, Optional

import bpy

# How often the main thread drains finished work. 0.2s is below the threshold
# where a person notices lag but costs nothing measurable.
_TICK_SECONDS = 0.2

_results: "queue.Queue[_Result]" = queue.Queue()
_timer_running = False

#: Tasks that have been started and not yet reported. Used for UI progress.
_active: Dict[str, "Task"] = {}


class _Result:
    __slots__ = ("task_id", "value", "error")

    def __init__(self, task_id: str, value: Any = None, error: Optional[BaseException] = None):
        self.task_id = task_id
        self.value = value
        self.error = error


class Task:
    """A unit of background work and the callbacks that report it."""

    __slots__ = ("task_id", "label", "on_done", "on_error", "thread")

    def __init__(
        self,
        task_id: str,
        label: str,
        on_done: Optional[Callable[[Any], None]],
        on_error: Optional[Callable[[BaseException], None]],
    ):
        self.task_id = task_id
        self.label = label
        self.on_done = on_done
        self.on_error = on_error
        self.thread: Optional[threading.Thread] = None


def is_running(task_id: str) -> bool:
    return task_id in _active


def active_labels() -> List[str]:
    return [task.label for task in _active.values()]


def any_running() -> bool:
    return bool(_active)


def run(
    task_id: str,
    label: str,
    work: Callable[[], Any],
    on_done: Optional[Callable[[Any], None]] = None,
    on_error: Optional[Callable[[BaseException], None]] = None,
    replace: bool = False,
) -> bool:
    """Starts ``work`` on a worker thread.

    ``work`` runs off the main thread and must not touch ``bpy``. ``on_done``
    and ``on_error`` run on the main thread and may.

    Returns False if a task with this id is already in flight and ``replace``
    is False — which is how the UI stops a double-click from starting two syncs.
    """
    if task_id in _active and not replace:
        return False

    task = Task(task_id, label, on_done, on_error)
    _active[task_id] = task

    def _runner() -> None:
        try:
            value = work()
            _results.put(_Result(task_id, value=value))
        except BaseException as exc:  # noqa: BLE001 - must never kill the thread silently
            _results.put(_Result(task_id, error=exc))

    thread = threading.Thread(target=_runner, name=f"projectflow-{task_id}", daemon=True)
    task.thread = thread
    thread.start()

    _ensure_timer()
    return True


def _drain() -> Optional[float]:
    """Timer callback. Runs on the main thread; safe to touch bpy from here."""
    global _timer_running

    redraw_needed = False

    while True:
        try:
            result = _results.get_nowait()
        except queue.Empty:
            break

        task = _active.pop(result.task_id, None)
        redraw_needed = True

        if task is None:
            continue

        try:
            if result.error is not None:
                if task.on_error is not None:
                    task.on_error(result.error)
                else:
                    print(f"[ProjectFlow] {task.label} failed: {result.error}")
            elif task.on_done is not None:
                task.on_done(result.value)
        except Exception:  # noqa: BLE001 - a bad callback must not stop the timer
            print(f"[ProjectFlow] Error handling result of {task.label}:")
            traceback.print_exc()

    if redraw_needed:
        redraw_ui()

    if not _active:
        # Nothing left to watch. Stop ticking and let the next run() restart us.
        _timer_running = False
        return None

    return _TICK_SECONDS


def _ensure_timer() -> None:
    global _timer_running
    if _timer_running:
        return
    _timer_running = True
    bpy.app.timers.register(_drain, first_interval=_TICK_SECONDS)


def redraw_ui() -> None:
    """Tags every 3D viewport sidebar for redraw.

    Background results arrive outside Blender's normal event flow, so panels do
    not repaint on their own and the UI would sit on stale text until the user
    moved the mouse over it.
    """
    context = bpy.context
    if not context or not context.window_manager:
        return
    for window in context.window_manager.windows:
        for area in window.screen.areas:
            if area.type == "VIEW_3D":
                area.tag_redraw()


def shutdown() -> None:
    """Called on unregister. Threads are daemons, so we only stop the timer.

    Results still in the queue are dropped deliberately: their callbacks close
    over handlers that are being torn down, and running them during unregister
    is how add-ons crash on reload.
    """
    global _timer_running

    _active.clear()
    while True:
        try:
            _results.get_nowait()
        except queue.Empty:
            break

    if _timer_running:
        try:
            bpy.app.timers.unregister(_drain)
        except ValueError:
            pass
        _timer_running = False

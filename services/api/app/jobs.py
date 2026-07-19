from __future__ import annotations

from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor


_executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="vcbrain-job")


def enqueue_analysis_job(work: Callable[[], None]) -> None:
    """Run a bounded analysis task off the request thread.

    The persisted AnalysisJob remains the source of truth, so a restart never
    turns an in-flight request into an invisible failure.
    """
    _executor.submit(work)

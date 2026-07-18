from .models import ConnectorKind, Signal


def pull_signals(
    connectors: list[ConnectorKind],
    query: str,
    github_user: str | None = None,
    arxiv_query: str | None = None,
) -> list[Signal]:
    signals: list[Signal] = []
    for connector in connectors:
        if connector == ConnectorKind.github and github_user:
            signals.append(_github_signal(github_user))
        elif connector == ConnectorKind.hacker_news:
            signals.append(_discussion_signal(connector, query))
        elif connector == ConnectorKind.product_hunt:
            signals.append(_discussion_signal(connector, query))
        elif connector == ConnectorKind.arxiv:
            signals.append(_arxiv_signal(arxiv_query or query))
    return signals


def _github_signal(user: str) -> Signal:
    return Signal(
        source=ConnectorKind.github,
        title=f"GitHub profile: {user}",
        url=f"https://github.com/{user}",
        text=f"GitHub signal for founder handle {user}.",
        metadata={"handle": user},
    )


def _discussion_signal(source: ConnectorKind, query: str) -> Signal:
    name = source.value.replace("_", " ").title()
    return Signal(
        source=source,
        title=f"{name} signal: {query}",
        text=f"{name} mentions or launch signal for {query}.",
        metadata={"query": query},
    )


def _arxiv_signal(query: str) -> Signal:
    return Signal(
        source=ConnectorKind.arxiv,
        title=f"arXiv research signal: {query}",
        url=f"https://arxiv.org/search/?query={query}&searchtype=all",
        text=f"arXiv research activity related to {query}.",
        metadata={"query": query},
    )

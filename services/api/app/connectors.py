import json
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from typing import Any

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
            signals.extend(_hacker_news_signals(query))
        elif connector == ConnectorKind.product_hunt:
            signals.append(_product_hunt_signal(query))
        elif connector == ConnectorKind.arxiv:
            signals.extend(_arxiv_signals(arxiv_query or query))
    return signals


def _github_signal(user: str) -> Signal:
    data = _get_json(f"https://api.github.com/users/{urllib.parse.quote(user)}")
    if not data:
        return Signal(
            source=ConnectorKind.github,
            title=f"GitHub profile: {user}",
            url=f"https://github.com/{user}",
            text=f"GitHub signal for founder handle {user}.",
            metadata={"handle": user, "fetch_status": "fallback"},
        )

    repos = int(data.get("public_repos") or 0)
    followers = int(data.get("followers") or 0)
    created_at = data.get("created_at")
    return Signal(
        source=ConnectorKind.github,
        title=f"GitHub profile: {user}",
        url=f"https://github.com/{user}",
        text=f"{user} has {repos} public repos and {followers} followers on GitHub.",
        metadata={
            "handle": user,
            "public_repos": repos,
            "followers": followers,
            "created_at": created_at,
            "fetch_status": "live",
        },
    )


def _hacker_news_signals(query: str) -> list[Signal]:
    url = "https://hn.algolia.com/api/v1/search?" + urllib.parse.urlencode({"query": query, "tags": "story"})
    data = _get_json(url)
    hits = (data or {}).get("hits", [])[:3]
    if not hits:
        return [_discussion_fallback(ConnectorKind.hacker_news, query)]

    signals: list[Signal] = []
    for hit in hits:
        title = hit.get("title") or hit.get("story_title") or f"HN signal: {query}"
        points = int(hit.get("points") or 0)
        comments = int(hit.get("num_comments") or 0)
        signals.append(
            Signal(
                source=ConnectorKind.hacker_news,
                title=title,
                url=hit.get("url") or f"https://news.ycombinator.com/item?id={hit.get('objectID')}",
                text=f"Hacker News discussion for {query}: {title}.",
                metadata={
                    "points": points,
                    "comments": comments,
                    "object_id": hit.get("objectID"),
                    "fetch_status": "live",
                },
            )
        )
    return signals


def _product_hunt_signal(query: str) -> Signal:
    encoded = urllib.parse.quote(query)
    return Signal(
        source=ConnectorKind.product_hunt,
        title=f"Product Hunt search: {query}",
        url=f"https://www.producthunt.com/search?q={encoded}",
        text=f"Product Hunt launch surface for {query}.",
        metadata={"query": query, "fetch_status": "search_url"},
    )


def _arxiv_signals(query: str) -> list[Signal]:
    params = urllib.parse.urlencode({"search_query": f"all:{query}", "start": 0, "max_results": 3})
    xml = _get_text(f"https://export.arxiv.org/api/query?{params}")
    if not xml:
        return [_arxiv_fallback(query)]

    root = ET.fromstring(xml)
    ns = {"atom": "http://www.w3.org/2005/Atom"}
    signals: list[Signal] = []
    for entry in root.findall("atom:entry", ns):
        title = " ".join((entry.findtext("atom:title", default="", namespaces=ns)).split())
        summary = " ".join((entry.findtext("atom:summary", default="", namespaces=ns)).split())
        link = entry.find("atom:link[@title='pdf']", ns) or entry.find("atom:link", ns)
        signals.append(
            Signal(
                source=ConnectorKind.arxiv,
                title=title or f"arXiv signal: {query}",
                url=link.attrib.get("href") if link is not None else None,
                text=summary[:500] or f"arXiv research activity related to {query}.",
                metadata={"query": query, "fetch_status": "live"},
            )
        )
    return signals or [_arxiv_fallback(query)]


def _discussion_fallback(source: ConnectorKind, query: str) -> Signal:
    name = source.value.replace("_", " ").title()
    return Signal(
        source=source,
        title=f"{name} signal: {query}",
        text=f"{name} mentions or launch signal for {query}.",
        metadata={"query": query, "fetch_status": "fallback"},
    )


def _arxiv_fallback(query: str) -> Signal:
    encoded = urllib.parse.quote(query)
    return Signal(
        source=ConnectorKind.arxiv,
        title=f"arXiv research signal: {query}",
        url=f"https://arxiv.org/search/?query={encoded}&searchtype=all",
        text=f"arXiv research activity related to {query}.",
        metadata={"query": query, "fetch_status": "fallback"},
    )


def _get_json(url: str) -> dict[str, Any] | None:
    text = _get_text(url)
    return json.loads(text) if text else None


def _get_text(url: str) -> str | None:
    try:
        request = urllib.request.Request(url, headers={"User-Agent": "VCBrain/0.1"})
        with urllib.request.urlopen(request, timeout=4) as response:
            return response.read().decode("utf-8")
    except Exception:
        return None

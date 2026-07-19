import json
import os
import re
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from html.parser import HTMLParser
from typing import Any

from .models import ConnectorKind, Signal
from .prompts import PERPLEXITY_DILIGENCE_SYSTEM_PROMPT


def pull_signals(
    connectors: list[ConnectorKind],
    query: str,
    github_user: str | None = None,
    arxiv_query: str | None = None,
    website_url: str | None = None,
    max_website_pages: int = 3,
) -> list[Signal]:
    signals: list[Signal] = []
    for connector in connectors:
        if connector == ConnectorKind.github and github_user:
            signals.append(_github_signal(github_user))
        elif connector == ConnectorKind.hacker_news:
            signals.extend(_hacker_news_signals(query))
        elif connector == ConnectorKind.product_hunt:
            signals.extend(_product_hunt_signals(query))
        elif connector == ConnectorKind.arxiv:
            signals.extend(_arxiv_signals(arxiv_query or query))
        elif connector == ConnectorKind.website and website_url:
            signals.extend(_website_signals(website_url, max_website_pages))
        elif connector == ConnectorKind.perplexity:
            signals.extend(_perplexity_signals(query))
        elif connector == ConnectorKind.exa:
            signals.extend(_exa_signals(query))
        elif connector == ConnectorKind.tavily:
            signals.extend(_tavily_signals(query))
        elif connector == ConnectorKind.opencorporates:
            signals.extend(_opencorporates_signals(query))
        elif connector == ConnectorKind.sec_edgar:
            signals.extend(_sec_edgar_signals(query))
        elif connector == ConnectorKind.patentsview:
            signals.extend(_patentsview_signals(query))
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
    return Signal(
        source=ConnectorKind.github,
        title=f"GitHub profile: {user}",
        url=f"https://github.com/{user}",
        text=f"{user} has {repos} public repos and {followers} followers on GitHub.",
        metadata={
            "handle": user,
            "public_repos": repos,
            "followers": followers,
            "created_at": data.get("created_at"),
            "fetch_status": "live",
        },
    )


def _hacker_news_signals(query: str) -> list[Signal]:
    url = "https://hn.algolia.com/api/v1/search?" + urllib.parse.urlencode({"query": query, "tags": "story"})
    data = _get_json(url)
    hits = (data or {}).get("hits", [])[:3]
    if not hits:
        return [_fallback(ConnectorKind.hacker_news, query, "community discussion")]

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


def _product_hunt_signals(query: str) -> list[Signal]:
    token = os.getenv("PRODUCT_HUNT_TOKEN")
    if not token:
        return [_product_hunt_fallback(query)]

    body = {
        "query": """
        query SearchPosts($query: String!) {
          posts(first: 3, search: $query) {
            edges {
              node { name tagline url votesCount commentsCount }
            }
          }
        }
        """,
        "variables": {"query": query},
    }
    data = _post_json(
        "https://api.producthunt.com/v2/api/graphql",
        body,
        {"Authorization": f"Bearer {token}"},
    )
    edges = (((data or {}).get("data") or {}).get("posts") or {}).get("edges", [])
    signals = []
    for edge in edges:
        node = edge.get("node") or {}
        signals.append(
            Signal(
                source=ConnectorKind.product_hunt,
                title=node.get("name") or f"Product Hunt: {query}",
                url=node.get("url"),
                text=node.get("tagline") or f"Product Hunt launch signal for {query}.",
                metadata={
                    "votes": int(node.get("votesCount") or 0),
                    "comments": int(node.get("commentsCount") or 0),
                    "fetch_status": "live",
                },
            )
        )
    return signals or [_product_hunt_fallback(query)]


def _product_hunt_fallback(query: str) -> Signal:
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


def _website_signals(url: str, max_pages: int = 3) -> list[Signal]:
    root = urllib.parse.urlparse(url)
    queue = [url]
    visited: set[str] = set()
    signals: list[Signal] = []
    while queue and len(visited) < max_pages:
        page_url = queue.pop(0)
        if page_url in visited:
            continue
        visited.add(page_url)
        html = _get_text(page_url)
        if not html:
            continue
        parser = TextHTMLParser()
        parser.feed(html)
        title = parser.title or f"Website: {page_url}"
        text = _clean_text(" ".join(parser.text))[:1800]
        links = [urllib.parse.urljoin(page_url, link) for link in parser.links]
        signals.append(Signal(
            source=ConnectorKind.website,
            title=title,
            url=page_url,
            text=text or f"Company website content from {page_url}.",
            metadata={"fetch_status": "live", "links": links[:20], "crawled_pages": len(visited), "character_count": len(text)},
        ))
        for link in links:
            parsed = urllib.parse.urlparse(link)
            if parsed.netloc == root.netloc and link not in visited and link not in queue:
                queue.append(link)
    return signals or [_fallback(ConnectorKind.website, url, "company website")]


def _perplexity_signals(query: str) -> list[Signal]:
    token = os.getenv("PERPLEXITY_API_KEY")
    if not token:
        return [_fallback(ConnectorKind.perplexity, query, "web-grounded diligence research")]

    data = _post_json(
        "https://api.perplexity.ai/v1/sonar",
        {
            "model": "sonar",
            "messages": [
            {
                "role": "system",
                "content": PERPLEXITY_DILIGENCE_SYSTEM_PROMPT,
            },
                {"role": "user", "content": f"Find recent startup diligence signals for {query}."},
            ],
        },
        {"Authorization": f"Bearer {token}"},
    )
    choice = ((data or {}).get("choices") or [{}])[0]
    message = choice.get("message") or {}
    results = (data or {}).get("search_results") or []
    return [
        Signal(
            source=ConnectorKind.perplexity,
            title=f"Perplexity diligence: {query}",
            url=(results[0] or {}).get("url") if results else None,
            text=message.get("content") or f"Perplexity diligence research for {query}.",
            metadata={"search_results": results[:5], "fetch_status": "live"},
        )
    ]


def _exa_signals(query: str) -> list[Signal]:
    token = os.getenv("EXA_API_KEY")
    if not token:
        return [_fallback(ConnectorKind.exa, query, "semantic web search")]

    data = _post_json(
        "https://api.exa.ai/search",
        {"query": query, "numResults": 3, "contents": {"highlights": True}},
        {"x-api-key": token},
    )
    results = (data or {}).get("results") or []
    return [
        Signal(
            source=ConnectorKind.exa,
            title=result.get("title") or f"Exa result: {query}",
            url=result.get("url"),
            text=result.get("text") or " ".join(result.get("highlights") or []) or f"Exa search result for {query}.",
            metadata={
                "published_date": result.get("publishedDate"),
                "author": result.get("author"),
                "fetch_status": "live",
            },
        )
        for result in results[:3]
    ] or [_fallback(ConnectorKind.exa, query, "semantic web search")]


def _tavily_signals(query: str) -> list[Signal]:
    token = os.getenv("TAVILY_API_KEY")
    if not token:
        return [_fallback(ConnectorKind.tavily, query, "web search and extraction")]

    data = _post_json(
        "https://api.tavily.com/search",
        {"query": query, "max_results": 3, "include_answer": True},
        {"Authorization": f"Bearer {token}"},
    )
    answer = (data or {}).get("answer")
    results = (data or {}).get("results") or []
    signals = []
    if answer:
        signals.append(
            Signal(
                source=ConnectorKind.tavily,
                title=f"Tavily answer: {query}",
                text=answer,
                metadata={"fetch_status": "live", "kind": "answer"},
            )
        )
    for result in results[:3]:
        signals.append(
            Signal(
                source=ConnectorKind.tavily,
                title=result.get("title") or f"Tavily result: {query}",
                url=result.get("url"),
                text=result.get("content") or f"Tavily result for {query}.",
                metadata={"score": result.get("score"), "fetch_status": "live"},
            )
        )
    return signals or [_fallback(ConnectorKind.tavily, query, "web search and extraction")]


def _opencorporates_signals(query: str) -> list[Signal]:
    params = {"q": query}
    token = os.getenv("OPENCORPORATES_API_TOKEN")
    if token:
        params["api_token"] = token
    url = "https://api.opencorporates.com/v0.4/companies/search?" + urllib.parse.urlencode(params)
    data = _get_json(url)
    companies = (((data or {}).get("results") or {}).get("companies") or [])[:3]
    signals = []
    for item in companies:
        company = item.get("company") or {}
        name = company.get("name") or f"OpenCorporates match: {query}"
        signals.append(
            Signal(
                source=ConnectorKind.opencorporates,
                title=name,
                url=company.get("opencorporates_url"),
                text=f"{name} is listed as {company.get('current_status') or 'unknown status'} in {company.get('jurisdiction_code') or 'unknown jurisdiction'}.",
                metadata={
                    "company_number": company.get("company_number"),
                    "jurisdiction_code": company.get("jurisdiction_code"),
                    "status": company.get("current_status"),
                    "incorporation_date": company.get("incorporation_date"),
                    "fetch_status": "live",
                },
            )
        )
    return signals or [_fallback(ConnectorKind.opencorporates, query, "legal entity registry")]


def _sec_edgar_signals(query: str) -> list[Signal]:
    data = _get_json("https://www.sec.gov/files/company_tickers.json")
    rows = (data or {}).values() if isinstance(data, dict) else []
    matches = [
        row
        for row in rows
        if query.lower() in str(row.get("title", "")).lower()
    ][:3]
    signals = []
    for row in matches:
        cik = str(row.get("cik_str")).zfill(10)
        title = row.get("title") or f"SEC EDGAR match: {query}"
        signals.append(
            Signal(
                source=ConnectorKind.sec_edgar,
                title=title,
                url=f"https://data.sec.gov/submissions/CIK{cik}.json",
                text=f"{title} appears in SEC EDGAR company ticker data.",
                metadata={"cik": cik, "ticker": row.get("ticker"), "fetch_status": "live"},
            )
        )
    return signals or [_fallback(ConnectorKind.sec_edgar, query, "SEC EDGAR filings")]


def _patentsview_signals(query: str) -> list[Signal]:
    encoded = urllib.parse.quote(query)
    return [
        Signal(
            source=ConnectorKind.patentsview,
            title=f"PatentsView search: {query}",
            url=f"https://search.patentsview.org/?q={encoded}",
            text=f"Patent and inventor search surface for {query}.",
            metadata={"query": query, "fetch_status": "search_url"},
        )
    ]


def _fallback(source: ConnectorKind, query: str, purpose: str) -> Signal:
    name = source.value.replace("_", " ").title()
    return Signal(
        source=source,
        title=f"{name}: {query}",
        text=f"{name} fallback for {purpose} related to {query}.",
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


class TextHTMLParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.title: str | None = None
        self.links: list[str] = []
        self.text: list[str] = []
        self._in_title = False

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag == "title":
            self._in_title = True
        if tag == "a":
            href = dict(attrs).get("href")
            if href:
                self.links.append(href)

    def handle_endtag(self, tag: str) -> None:
        if tag == "title":
            self._in_title = False

    def handle_data(self, data: str) -> None:
        value = data.strip()
        if not value:
            return
        if self._in_title and not self.title:
            self.title = value
        elif len(value) > 2:
            self.text.append(value)


def _clean_text(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def _get_json(url: str) -> dict[str, Any] | None:
    text = _get_text(url)
    return json.loads(text) if text else None


def _post_json(url: str, body: dict[str, Any], headers: dict[str, str]) -> dict[str, Any] | None:
    try:
        request = urllib.request.Request(
            url,
            data=json.dumps(body).encode("utf-8"),
            headers={
                "Content-Type": "application/json",
                "User-Agent": "IskraVC/0.1 hacknation@example.local",
                **headers,
            },
        )
        with urllib.request.urlopen(request, timeout=8) as response:
            return json.loads(response.read().decode("utf-8"))
    except Exception:
        return None


def _get_text(url: str) -> str | None:
    try:
        request = urllib.request.Request(url, headers={"User-Agent": "IskraVC/0.1 hacknation@example.local"})
        with urllib.request.urlopen(request, timeout=6) as response:
            return response.read().decode("utf-8")
    except Exception:
        return None

"""
Scrape a public Letterboxd list and produce CSV in tracked-lists export format.
"""
import csv
import io
import logging
import re
import time
from dataclasses import dataclass
from datetime import date
from typing import List, Optional, Tuple
from urllib.parse import urlparse

import requests
from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)

USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
)
LETTERBOXD_BASE = "https://letterboxd.com"
NAME_YEAR_RE = re.compile(r"^(.+?)\s+\((\d{4})\)\s*$")
PAGE_RE = re.compile(r"/page/(\d+)/?")


@dataclass
class ScrapedFilm:
    position: int
    name: str
    year: int
    url: str


class LetterboxdScraperError(Exception):
    pass


def _session() -> requests.Session:
    session = requests.Session()
    session.headers.update({"User-Agent": USER_AGENT})
    return session


def resolve_list_url(url: str, session: Optional[requests.Session] = None) -> str:
    """Follow redirects and return the canonical list URL."""
    session = session or _session()
    response = session.get(url, allow_redirects=True, timeout=30)
    response.raise_for_status()
    final_url = response.url.rstrip("/") + "/"
    if "/film/" in final_url and "/list/" not in final_url:
        raise LetterboxdScraperError(
            f"URL does not appear to be a list page: {final_url}"
        )
    return final_url


def _list_base_url(list_url: str) -> str:
    """Strip /page/N/ from a list URL."""
    return PAGE_RE.sub("/", list_url.rstrip("/")).rstrip("/") + "/"


def _page_url(base_url: str, page: int) -> str:
    if page <= 1:
        return base_url
    return f"{_list_base_url(base_url)}page/{page}/"


def get_max_page(soup: BeautifulSoup) -> int:
    max_page = 1
    for anchor in soup.select("li.paginate-page a"):
        text = anchor.get_text(strip=True)
        if text.isdigit():
            max_page = max(max_page, int(text))
        href = anchor.get("href") or ""
        match = PAGE_RE.search(href)
        if match:
            max_page = max(max_page, int(match.group(1)))
    return max_page


def parse_name_year(raw: str) -> Tuple[str, Optional[int]]:
    raw = (raw or "").strip()
    match = NAME_YEAR_RE.match(raw)
    if match:
        return match.group(1).strip(), int(match.group(2))
    return raw, None


def slug_from_title(title: str) -> str:
    slug = title.lower()
    slug = re.sub(r"['']", "", slug)
    slug = re.sub(r"[^a-z0-9]+", "-", slug)
    return slug.strip("-")


def fetch_page_html(url: str, session: requests.Session) -> BeautifulSoup:
    response = session.get(url, timeout=30)
    response.raise_for_status()
    return BeautifulSoup(response.text, "html.parser")


def scrape_list_title(soup: BeautifulSoup) -> Optional[str]:
    for selector in ("h1.title-1", "h1.headline-1", ".content-wrap h1"):
        element = soup.select_one(selector)
        if element:
            text = element.get_text(strip=True)
            if text and "Your life in film" not in text:
                return text
    return None


def _film_path(url: str) -> str:
    parsed = urlparse(url)
    path = parsed.path.rstrip("/")
    if path.startswith("/film/"):
        return path
    return path


def parse_films_from_page(soup: BeautifulSoup) -> List[dict]:
    films = []
    seen_paths = set()

    components = soup.select(".react-component[data-item-slug]")
    if not components:
        components = soup.select(".really-lazy-load[data-target-link]")

    for element in components:
        if element.has_attr("data-item-slug"):
            slug = element.get("data-item-slug")
            link = element.get("data-item-link") or element.get("data-target-link") or f"/film/{slug}/"
            name, year = parse_name_year(element.get("data-item-name") or "")
        else:
            link = element.get("data-target-link") or ""
            slug = link.strip("/").split("/")[-1] if link else None
            alt = element.select_one("img")
            name, year = parse_name_year(alt.get("alt", "") if alt else "")
            if not name and slug:
                name = slug.replace("-", " ").title()

        if not link:
            continue
        if not link.startswith("http"):
            link = LETTERBOXD_BASE + link

        path = _film_path(link)
        if path in seen_paths:
            continue
        seen_paths.add(path)

        films.append({"name": name, "year": year, "url": link, "path": path})

    return films


def enrich_film_year(url: str, session: requests.Session) -> Optional[int]:
    soup = fetch_page_html(url, session)
    year_el = soup.select_one("small.number")
    if year_el:
        text = year_el.get_text(strip=True)
        if text.isdigit():
            return int(text)
    return None


def scrape_list(
    url: str,
    *,
    delay: float = 0.75,
    enrich: bool = False,
) -> Tuple[str, str, List[ScrapedFilm]]:
    """
    Scrape all pages of a Letterboxd list.

    Returns (resolved_list_url, list_title, films).
    """
    session = _session()
    resolved = resolve_list_url(url, session)
    base_url = _list_base_url(resolved)

    first_soup = fetch_page_html(base_url, session)
    list_title = scrape_list_title(first_soup) or "Letterboxd List"
    max_page = get_max_page(first_soup)

    all_films: List[ScrapedFilm] = []
    seen_paths = set()
    position = 0

    for page in range(1, max_page + 1):
        page_url = _page_url(base_url, page)
        soup = first_soup if page == 1 else fetch_page_html(page_url, session)
        page_films = parse_films_from_page(soup)

        if not page_films and page == 1:
            raise LetterboxdScraperError(
                "No films found on the list page. The list may be private, "
                "require login, or Letterboxd may have changed their HTML layout."
            )

        for film in page_films:
            path = film["path"]
            if path in seen_paths:
                continue
            seen_paths.add(path)

            year = film["year"]
            if year is None and enrich:
                year = enrich_film_year(film["url"], session)
                time.sleep(delay)

            if year is None:
                logger.warning("Skipping %s (%s): no year found", film["name"], film["url"])
                continue

            position += 1
            all_films.append(
                ScrapedFilm(
                    position=position,
                    name=film["name"],
                    year=year,
                    url=film["url"],
                )
            )

        if page < max_page:
            time.sleep(delay)

    if not all_films:
        raise LetterboxdScraperError("No films were scraped from the list.")

    return resolved, list_title, all_films


def format_tracked_list_csv(
    films: List[ScrapedFilm],
    *,
    list_name: str,
    source_url: str,
    export_date: Optional[str] = None,
) -> str:
    """Format films as Letterboxd list export v7 CSV."""
    export_date = export_date or date.today().isoformat()
    buffer = io.StringIO()
    writer = csv.writer(buffer, lineterminator="\n")

    writer.writerow(["Letterboxd list export v7"])
    writer.writerow(["Date", "Name", "Tags", "URL", "Description"])
    writer.writerow([export_date, list_name, "", source_url, ""])
    writer.writerow([])
    writer.writerow(["Position", "Name", "Year", "URL", "Description"])

    for film in films:
        writer.writerow([film.position, film.name, film.year, film.url, ""])

    return buffer.getvalue()

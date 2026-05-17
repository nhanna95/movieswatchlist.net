#!/usr/bin/env python3
"""
Scrape a Letterboxd list URL and write tracked-lists-compatible CSV.

Example:
  cd backend && ./venv/bin/python ../scripts/scrape_letterboxd_list.py \\
    --url "https://boxd.it/8HjM" \\
    --output ../tracked-lists/letterboxd-t500.csv \\
    --list-name "Letterboxd Top 500"
"""
import argparse
import logging
import sys
from pathlib import Path

# Allow imports from backend/
BACKEND_DIR = Path(__file__).resolve().parent.parent / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from letterboxd_list_scraper import (  # noqa: E402
    LetterboxdScraperError,
    format_tracked_list_csv,
    scrape_list,
    slug_from_title,
)
from csv_parser import parse_tracked_list_csv  # noqa: E402

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_TRACKED_LISTS_DIR = PROJECT_ROOT / "tracked-lists"


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Scrape a Letterboxd list and export tracked-lists CSV."
    )
    parser.add_argument("--url", required=True, help="Letterboxd or boxd.it list URL")
    parser.add_argument(
        "--output",
        help="Output CSV path (default: tracked-lists/{slug}.csv)",
    )
    parser.add_argument(
        "--slug",
        help="Filename stem for default output (default: derived from list title)",
    )
    parser.add_argument(
        "--list-name",
        help="List name in CSV metadata (default: scraped page title)",
    )
    parser.add_argument(
        "--stdout",
        action="store_true",
        help="Print CSV to stdout instead of writing a file",
    )
    parser.add_argument(
        "--enrich",
        action="store_true",
        help="Fetch film pages when year is missing on list row",
    )
    parser.add_argument(
        "--delay",
        type=float,
        default=0.75,
        help="Delay between HTTP requests in seconds (default: 0.75)",
    )
    parser.add_argument(
        "--validate",
        action="store_true",
        help="Validate output with parse_tracked_list_csv",
    )
    parser.add_argument(
        "-v",
        "--verbose",
        action="store_true",
        help="Enable debug logging",
    )
    args = parser.parse_args()

    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(levelname)s: %(message)s",
    )

    try:
        resolved_url, scraped_title, films = scrape_list(
            args.url,
            delay=args.delay,
            enrich=args.enrich,
        )
    except LetterboxdScraperError as exc:
        logging.error("%s", exc)
        return 1
    except Exception as exc:
        logging.error("Scrape failed: %s", exc)
        return 1

    list_name = args.list_name or scraped_title
    slug = args.slug or slug_from_title(list_name)
    csv_text = format_tracked_list_csv(
        films,
        list_name=list_name,
        source_url=args.url,
    )

    if args.stdout:
        sys.stdout.write(csv_text)
        output_path = None
    else:
        if args.output:
            output_path = Path(args.output)
        else:
            DEFAULT_TRACKED_LISTS_DIR.mkdir(parents=True, exist_ok=True)
            output_path = DEFAULT_TRACKED_LISTS_DIR / f"{slug}.csv"
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(csv_text, encoding="utf-8")
        logging.info("Wrote %d films to %s", len(films), output_path)

    logging.info("List: %s", list_name)
    logging.info("Resolved URL: %s", resolved_url)
    logging.info("Films scraped: %d", len(films))

    if args.validate:
        validate_path = output_path
        if validate_path is None:
            import tempfile

            with tempfile.NamedTemporaryFile(
                mode="w", suffix=".csv", delete=False, encoding="utf-8"
            ) as tmp:
                tmp.write(csv_text)
                validate_path = Path(tmp.name)
        try:
            parsed = parse_tracked_list_csv(str(validate_path))
            logging.info("Validation OK: parse_tracked_list_csv returned %d movies", len(parsed))
            if len(parsed) != len(films):
                logging.warning(
                    "Parsed count (%d) differs from scraped count (%d)",
                    len(parsed),
                    len(films),
                )
        except Exception as exc:
            logging.error("Validation failed: %s", exc)
            return 1
        finally:
            if args.stdout and validate_path:
                validate_path.unlink(missing_ok=True)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())

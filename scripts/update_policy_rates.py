import csv
import os
from datetime import date, timedelta
from decimal import Decimal, InvalidOperation
from pathlib import Path
from tempfile import NamedTemporaryFile
from xml.etree import ElementTree

import requests


API_URL = "https://stats.bis.org/api/v2/data/dataflow/BIS/WS_CBPOL/1.0/D.{area}"
OUTPUT_FILE = Path("policy_rates.csv")
LOOKBACK_DAYS = 45

CURRENCIES = [
    ("EUR", "XM"),
    ("JPY", "JP"),
    ("GBP", "GB"),
    ("CHF", "CH"),
    ("CAD", "CA"),
    ("AUD", "AU"),
    ("NZD", "NZ"),
    ("MXN", "MX"),
    ("BRL", "BR"),
    ("USD", "US"),
]

FIELDNAMES = ["currency", "area_code", "rate", "as_of_date", "source"]


def fetch_latest_rate(currency: str, area: str, start_period: str) -> dict[str, str]:
    response = requests.get(
        API_URL.format(area=area),
        params={"startPeriod": start_period},
        headers={"User-Agent": "COT-Charts policy-rate updater"},
        timeout=30,
    )
    response.raise_for_status()

    root = ElementTree.fromstring(response.content)
    series = next((element for element in root.iter() if element.tag.endswith("Series")), None)
    if series is None:
        raise RuntimeError(f"BIS returned no daily policy-rate series for {currency} ({area}).")

    observations = [
        element
        for element in series
        if element.tag.endswith("Obs")
        and element.attrib.get("TIME_PERIOD")
        and element.attrib.get("OBS_VALUE")
    ]
    if not observations:
        raise RuntimeError(f"BIS returned no recent policy-rate observations for {currency} ({area}).")

    latest = max(observations, key=lambda element: element.attrib["TIME_PERIOD"])
    raw_rate = latest.attrib["OBS_VALUE"]
    try:
        rate = format(Decimal(raw_rate).normalize(), "f")
    except InvalidOperation as exc:
        raise RuntimeError(f"BIS returned an invalid policy rate for {currency}: {raw_rate}") from exc

    return {
        "currency": currency,
        "area_code": area,
        "rate": rate,
        "as_of_date": latest.attrib["TIME_PERIOD"],
        "source": series.attrib.get("SOURCE_REF", "Bank for International Settlements"),
    }


def write_rates(rows: list[dict[str, str]]) -> None:
    with NamedTemporaryFile(
        "w",
        encoding="utf-8",
        newline="",
        dir=OUTPUT_FILE.parent,
        prefix=f".{OUTPUT_FILE.name}.",
        delete=False,
    ) as temporary_file:
        writer = csv.DictWriter(temporary_file, fieldnames=FIELDNAMES)
        writer.writeheader()
        writer.writerows(rows)
        temporary_path = Path(temporary_file.name)

    os.replace(temporary_path, OUTPUT_FILE)


def main() -> None:
    start_period = (date.today() - timedelta(days=LOOKBACK_DAYS)).isoformat()
    rows = [
        fetch_latest_rate(currency, area, start_period)
        for currency, area in CURRENCIES
    ]

    if len(rows) != len(CURRENCIES):
        raise RuntimeError("Refusing to replace policy_rates.csv with an incomplete result.")

    write_rates(rows)
    latest_date = max(row["as_of_date"] for row in rows)
    print(f"Wrote {len(rows)} policy rates to {OUTPUT_FILE}")
    print(f"Latest BIS observation date: {latest_date}")


if __name__ == "__main__":
    main()

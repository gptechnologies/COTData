import os
import time
from pathlib import Path

import pandas as pd
import requests


API_URL = "https://publicreporting.cftc.gov/resource/6dca-aqww.json"
OUTPUT_FILE = Path("cot.csv")
PAGE_SIZE = 50000

SOURCE_COLUMNS = [
    "report_date_as_yyyy_mm_dd",
    "contract_market_name",
    "noncomm_positions_long_all",
    "noncomm_positions_short_all",
    "change_in_noncomm_long_all",
    "change_in_noncomm_short_all",
]

RENAME_COLUMNS = {
    "report_date_as_yyyy_mm_dd": "Report_Date_as_YYYY_MM_DD",
    "contract_market_name": "CONTRACT_MARKET_NAME",
    "noncomm_positions_long_all": "NonComm_Positions_Long_All",
    "noncomm_positions_short_all": "NonComm_Positions_Short_All",
    "change_in_noncomm_long_all": "Change_in_NonComm_Long_All",
    "change_in_noncomm_short_all": "Change_in_NonComm_Short_All",
}

FINAL_COLUMNS = list(RENAME_COLUMNS.values())

NUMERIC_COLUMNS = [
    "NonComm_Positions_Long_All",
    "NonComm_Positions_Short_All",
    "Change_in_NonComm_Long_All",
    "Change_in_NonComm_Short_All",
]


def fetch_page(offset: int) -> list[dict]:
    token = os.getenv("SOCRATA_APP_TOKEN")

    headers = {}
    if token:
        headers["X-App-Token"] = token

    params = {
        "$select": ",".join(SOURCE_COLUMNS),
        "$order": "report_date_as_yyyy_mm_dd ASC, contract_market_name ASC",
        "$limit": PAGE_SIZE,
        "$offset": offset,
    }

    response = requests.get(API_URL, params=params, headers=headers, timeout=60)
    response.raise_for_status()
    return response.json()


def fetch_all_rows() -> pd.DataFrame:
    frames = []
    offset = 0

    while True:
        rows = fetch_page(offset)

        if not rows:
            break

        frames.append(pd.DataFrame(rows))

        if len(rows) < PAGE_SIZE:
            break

        offset += PAGE_SIZE
        time.sleep(0.25)

    if not frames:
        raise RuntimeError("No rows returned from CFTC Socrata API.")

    return pd.concat(frames, ignore_index=True)


def clean_data(df: pd.DataFrame) -> pd.DataFrame:
    df = df.rename(columns=RENAME_COLUMNS)

    missing = [col for col in FINAL_COLUMNS if col not in df.columns]
    if missing:
        raise RuntimeError(f"Missing expected columns from API response: {missing}")

    df = df[FINAL_COLUMNS].copy()

    df["Report_Date_as_YYYY_MM_DD"] = (
        pd.to_datetime(df["Report_Date_as_YYYY_MM_DD"], errors="coerce")
        .dt.strftime("%Y-%m-%d")
    )

    for col in NUMERIC_COLUMNS:
        df[col] = pd.to_numeric(df[col], errors="coerce").astype("Int64")

    df = df.dropna(subset=["Report_Date_as_YYYY_MM_DD", "CONTRACT_MARKET_NAME"])

    df = df.sort_values(
        ["Report_Date_as_YYYY_MM_DD", "CONTRACT_MARKET_NAME"]
    ).drop_duplicates(
        subset=["Report_Date_as_YYYY_MM_DD", "CONTRACT_MARKET_NAME"],
        keep="last",
    )

    return df


def main() -> None:
    raw_df = fetch_all_rows()
    clean_df = clean_data(raw_df)

    clean_df.to_csv(OUTPUT_FILE, index=False)

    latest_date = clean_df["Report_Date_as_YYYY_MM_DD"].max()
    print(f"Wrote {len(clean_df):,} rows to {OUTPUT_FILE}")
    print(f"Latest report date: {latest_date}")


if __name__ == "__main__":
    main()

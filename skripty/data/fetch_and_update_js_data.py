import os
import json
import pandas as pd
from google.oauth2 import service_account
from googleapiclient.discovery import build

from log_helpers import log_info, log_success, log_error

# --- CONFIGURATION ---
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
CREDENTIALS_PATH = os.path.join(SCRIPT_DIR, '../../credentials.json') 
OUTPUT_JS_PATH = os.path.join(SCRIPT_DIR, './roles_data.js')

SCOPES = ['https://www.googleapis.com/auth/spreadsheets.readonly']
SPREADSHEET_ID = '1mVueRNWCCGcqutpNyM23R9tSs9Whgz010sLKNsfhB9U'


def get_google_sheet_service():
    """Authenticates and returns the sheets service."""
    creds = service_account.Credentials.from_service_account_file(
        CREDENTIALS_PATH, scopes=SCOPES
    )
    return build('sheets', 'v4', credentials=creds)

def fetch_roles(service):
    """Fetches and cleans the Roles data."""
    log_info("Fetching Roles for JavaScript export...")
    
    # Using dynamic range 'Role!A:Y' to catch all current & future rows automatically
    range_name = 'Role!A:Y' 
    result = service.spreadsheets().values().get(
        spreadsheetId=SPREADSHEET_ID, range=range_name
    ).execute()
    values = result.get('values', [])

    if not values:
        log_error("No data found in Role sheet!")
        return []

    df = pd.DataFrame(values[1:], columns=values[0])

    # Columns to keep (with comma fixed between 'edition' and 'ability_cz')
    cols = [
        'id', 'name_cz', 'name_eng', 'keyword', 'type', 'edition',
        'ability_cz', 'ability_eng', 'setup', 'setup_reminder_eng', 
        'setup_reminder_cz', 'setlist_position', 'first_night_position', 
        'first_night_reminder_eng', 'first_night_reminder_cz', 
        'other_night_position', 'other_night_reminder_eng', 
        'other_night_reminder_cz', 'jinx'
    ]
    
    available_cols = [c for c in cols if c in df.columns]
    df = df[available_cols]

    # Filter out empty keyword rows
    if 'keyword' in df.columns:
        df = df[df['keyword'].astype(str).str.strip() != ""]

    # Convert Integers
    int_cols = [
        "id",
        "setlist_position",
        "first_night_position",
        "other_night_position",
    ]
    for col in int_cols:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0).astype(int)

    # Convert Booleans
    if "setup" in df.columns:
        df["setup"] = df["setup"].astype(str).str.upper().str.strip() == "TRUE"
    if "jinx" in df.columns:
        df["jinx"] = df["jinx"].astype(str).str.upper().str.strip() == "TRUE"

    df = df.fillna("")
    
    log_info(f"Parsed {len(df)} roles successfully.")
    return df.to_dict(orient='records')

def fetch_jinxes(service):
    """Fetches and cleans the Jinx data."""
    log_info("Fetching Jinxes for JavaScript export...")
    
    range_name = 'Jinx!A:F'
    result = service.spreadsheets().values().get(
        spreadsheetId=SPREADSHEET_ID, range=range_name
    ).execute()
    values = result.get('values', [])

    if not values:
        log_error("No data found in Jinx sheet!")
        return []

    df = pd.DataFrame(values[1:], columns=values[0])

    cols = ["id", "who", "target", "position", "description_eng", "description_cz"]

    available_cols = [c for c in cols if c in df.columns]
    df = df[available_cols]

    # Filter out empty 'who' rows
    if 'who' in df.columns:
        df = df[df['who'].astype(str).str.strip() != ""]

    # Convert Integers
    int_cols = ["id", "position"]
    for col in int_cols:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce").fillna(0).astype(int)

    df = df.fillna("")
    
    log_info(f"Parsed {len(df)} jinxes successfully.")
    return df.to_dict(orient='records')

def generate_js_file(roles_data, jinx_data):
    """Writes combined role and jinx data to data.js."""
    os.makedirs(os.path.dirname(OUTPUT_JS_PATH), exist_ok=True)
    
    roles_json = json.dumps(roles_data, indent=4, ensure_ascii=False)
    jinx_json = json.dumps(jinx_data, indent=4, ensure_ascii=False)

    js_content = f"var rolesData = {roles_json};\n\nvar jinxData = {jinx_json};\n"

    with open(OUTPUT_JS_PATH, "w", encoding="utf-8") as f:
        f.write(js_content)

    log_success(f"JavaScript data bundle written to '{OUTPUT_JS_PATH}'")

def main():
    try:
        service = get_google_sheet_service()

        roles = fetch_roles(service)
        jinxes = fetch_jinxes(service)

        generate_js_file(roles, jinxes)
        
    except Exception as e:
        log_error(f"Failed to generate JavaScript data file: {e}")


if __name__ == "__main__":
    main()

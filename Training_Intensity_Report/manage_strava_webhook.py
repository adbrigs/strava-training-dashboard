"""
One-time(ish) management for the Strava push subscription (webhook).

Strava allows exactly ONE push subscription per API application. Use this to
view, create, or delete it.

Prereqs:
  - Your callback endpoint must already be DEPLOYED and public, because Strava
    validates it synchronously the moment you create the subscription:
        https://<your-vercel-domain>/api/strava-webhook
  - The Vercel env var STRAVA_VERIFY_TOKEN must equal the --verify-token you pass
    here (defaults to env STRAVA_VERIFY_TOKEN).

Usage:
  python manage_strava_webhook.py list
  python manage_strava_webhook.py create --callback-url https://<domain>/api/strava-webhook --verify-token <token>
  python manage_strava_webhook.py delete --id <subscription_id>

Credentials (client_id / client_secret) are read from config/credentials.json,
the same file the data pipeline uses.
"""

import argparse
import json
import os
import sys
from pathlib import Path

import requests

STRAVA_SUBS_URL = "https://www.strava.com/api/v3/push_subscriptions"


def load_client_creds():
    creds_json = os.getenv("CREDENTIALS_JSON")
    if creds_json:
        creds = json.loads(creds_json)
    else:
        path = Path(__file__).resolve().parent / "config" / "credentials.json"
        with open(path, "r") as f:
            creds = json.load(f)
    return creds["client_id"], creds["client_secret"]


def cmd_list(client_id, client_secret, _args):
    r = requests.get(
        STRAVA_SUBS_URL,
        params={"client_id": client_id, "client_secret": client_secret},
    )
    r.raise_for_status()
    subs = r.json()
    if not subs:
        print("No active subscriptions.")
    else:
        print(json.dumps(subs, indent=2))


def cmd_create(client_id, client_secret, args):
    verify_token = args.verify_token or os.getenv("STRAVA_VERIFY_TOKEN")
    if not verify_token:
        sys.exit("❌ Provide --verify-token or set STRAVA_VERIFY_TOKEN.")
    r = requests.post(
        STRAVA_SUBS_URL,
        data={
            "client_id": client_id,
            "client_secret": client_secret,
            "callback_url": args.callback_url,
            "verify_token": verify_token,
        },
    )
    if not r.ok:
        sys.exit(f"❌ Create failed: {r.status_code} {r.text}")
    print("✅ Subscription created:")
    print(json.dumps(r.json(), indent=2))


def cmd_delete(client_id, client_secret, args):
    r = requests.delete(
        f"{STRAVA_SUBS_URL}/{args.id}",
        params={"client_id": client_id, "client_secret": client_secret},
    )
    if not r.ok:
        sys.exit(f"❌ Delete failed: {r.status_code} {r.text}")
    print(f"✅ Deleted subscription {args.id}.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("list", help="Show the current subscription")

    p_create = sub.add_parser("create", help="Create the subscription")
    p_create.add_argument("--callback-url", required=True)
    p_create.add_argument("--verify-token", default=None)

    p_delete = sub.add_parser("delete", help="Delete a subscription by id")
    p_delete.add_argument("--id", required=True)

    args = parser.parse_args()
    client_id, client_secret = load_client_creds()

    {"list": cmd_list, "create": cmd_create, "delete": cmd_delete}[args.command](
        client_id, client_secret, args
    )


if __name__ == "__main__":
    main()

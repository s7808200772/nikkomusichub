#!/usr/bin/env python3
"""Update Linear project progress for NikkoMusicHub.

Requires LINEAR_API_TOKEN environment variable.
Usage:
    export LINEAR_API_TOKEN=lin_api_...
    python scripts/update_linear.py 85 "Phase 0-3 completed, 102/120 items done."
"""
import json
import os
import sys

import requests

LINEAR_API_URL = "https://api.linear.app/graphql"
PROJECT_NAME = "NikkoMusicHub"


def graphql(query, variables=None):
    token = os.environ.get("LINEAR_API_TOKEN")
    if not token:
        print("ERROR: LINEAR_API_TOKEN not set", file=sys.stderr)
        sys.exit(1)
    res = requests.post(
        LINEAR_API_URL,
        headers={"Authorization": token, "Content-Type": "application/json"},
        json={"query": query, "variables": variables or {}},
        timeout=30,
    )
    res.raise_for_status()
    data = res.json()
    if data.get("errors"):
        print("GraphQL errors:", data["errors"], file=sys.stderr)
        sys.exit(1)
    return data["data"]


def find_project_id():
    data = graphql(
        """
        query($name: String!) {
          projects(filter: { name: { eq: $name } }) {
            nodes { id name }
          }
        }
        """,
        {"name": PROJECT_NAME},
    )
    nodes = data["projects"]["nodes"]
    if not nodes:
        print(f"ERROR: Project '{PROJECT_NAME}' not found", file=sys.stderr)
        sys.exit(1)
    return nodes[0]["id"]


def create_project_update(project_id: str, body: str):
    data = graphql(
        """
        mutation($projectId: String!, $body: String!) {
          projectUpdateCreate(input: { projectId: $projectId, body: $body }) {
            success
            projectUpdate { id }
          }
        }
        """,
        {"projectId": project_id, "body": body},
    )
    return data["projectUpdateCreate"]["success"]


def main():
    progress = int(sys.argv[1]) if len(sys.argv) > 1 else 85
    extra = sys.argv[2] if len(sys.argv) > 2 else ""
    body = f"專案進度 {progress}%。{extra}".strip()
    project_id = find_project_id()
    ok = create_project_update(project_id, body)
    print(f"Created {PROJECT_NAME} project update at {progress}%: {ok}")


if __name__ == "__main__":
    main()

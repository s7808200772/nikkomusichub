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


def update_project_progress(project_id: str, progress: int):
    data = graphql(
        """
        mutation($id: String!, $progress: Float!) {
          projectUpdate(id: $id, input: { progress: $progress }) {
            success
          }
        }
        """,
        {"id": project_id, "progress": float(progress)},
    )
    return data["projectUpdate"]["success"]


def create_project_update(project_id: str, body: str):
    data = graphql(
        """
        mutation($projectId: String!, $body: String!) {
          projectUpdateCreate(input: { projectId: $projectId, body: $body }) {
            success
          }
        }
        """,
        {"projectId": project_id, "body": body},
    )
    return data["projectUpdateCreate"]["success"]


def main():
    progress = int(sys.argv[1]) if len(sys.argv) > 1 else 85
    body = sys.argv[2] if len(sys.argv) > 2 else "Progress update from scripts/update_linear.py"
    project_id = find_project_id()
    ok1 = update_project_progress(project_id, progress)
    ok2 = create_project_update(project_id, body)
    print(f"Updated {PROJECT_NAME} progress to {progress}%: {ok1}")
    print(f"Created project update: {ok2}")


if __name__ == "__main__":
    main()

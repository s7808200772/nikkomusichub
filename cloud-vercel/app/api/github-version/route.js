import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';

const GITHUB_REPO = 's7808200772/nikkomusichub';
const GITHUB_BRANCH = 'security-final';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const token = process.env.NIKKO_GITHUB_TOKEN;
  const headers = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  try {
    const res = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/commits?sha=${encodeURIComponent(GITHUB_BRANCH)}&per_page=1`,
      { headers, next: { revalidate: 60 } }
    );
    if (!res.ok) {
      return NextResponse.json(
        { error: `GitHub API error: ${res.status}` },
        { status: res.status }
      );
    }
    const data = await res.json();
    const commit = Array.isArray(data) ? data[0] : null;
    if (!commit?.sha) {
      return NextResponse.json({ error: 'No commit found' }, { status: 404 });
    }
    return NextResponse.json({
      sha: commit.sha,
      shortSha: commit.sha.slice(0, 7),
      message: commit.commit?.message?.split('\n')[0] || '',
      date: commit.commit?.committer?.date || '',
      author: commit.commit?.author?.name || '',
    });
  } catch (e) {
    return NextResponse.json(
      { error: e.message || 'Failed to fetch GitHub version' },
      { status: 500 }
    );
  }
}

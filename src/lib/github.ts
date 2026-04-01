const REPO_OWNER = 'schemalabz'
const REPO_NAME = 'opencouncil'

export interface GitHubStats {
    contributorCount: number
    /** Daily commit counts for last 12 weeks (84 days, oldest first) — for the grid */
    dailyCommits: number[]
    stars: number
}

/**
 * Fetches GitHub repo stats for the about page.
 * Uses the public GitHub API (no auth needed for public repos).
 */
export async function getGitHubStats(): Promise<GitHubStats> {
    const headers: HeadersInit = {
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'OpenCouncil-Website',
    }

    // Add token if available (higher rate limits)
    if (process.env.GITHUB_TOKEN) {
        headers['Authorization'] = `Bearer ${process.env.GITHUB_TOKEN}`
    }

    const [repoRes, contributorsRes, commitActivityRes] = await Promise.all([
        fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}`, { headers, next: { revalidate: 3600 } }),
        fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contributors?per_page=100`, { headers, next: { revalidate: 3600 } }),
        fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/stats/commit_activity`, { headers, next: { revalidate: 3600 } }),
    ])

    let stars = 0
    if (repoRes.ok) {
        const repo = await repoRes.json()
        stars = repo.stargazers_count ?? 0
    }

    let contributorCount = 0
    if (contributorsRes.ok) {
        const contributors = await contributorsRes.json()
        contributorCount = Array.isArray(contributors) ? contributors.length : 0
    }

    // commit_activity returns last 52 weeks of commit data
    // Each entry: { total: number, week: number, days: number[7] }
    let dailyCommits: number[] = []
    if (commitActivityRes.ok && commitActivityRes.status !== 202) {
        const activity = await commitActivityRes.json()
        if (Array.isArray(activity)) {
            // Take last 12 weeks, flatten daily data: each week has days[0..6] (Sun-Sat)
            dailyCommits = activity.slice(-12).flatMap((week: { days: number[] }) => week.days)
        }
    }

    return {
        contributorCount,
        dailyCommits,
        stars,
    }
}

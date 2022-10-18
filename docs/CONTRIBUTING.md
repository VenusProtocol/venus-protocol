# Contribution guidelines

We have a strict policy on how we should commit our work. Following these guidelines will help us to:

1. Avoid hard to solve merge conflicts. Our workflow favors rebase over merge in feature branches, so there are no complex dependencies between branches. We sacrifice the “full history” in favor of just “meaningful history”, thus avoiding unnecessary diffs.
2. Make our contracts more secure. It's easy to make a small mistake that would cost millions of dollars to the contract users. We need to peer review our contracts as thoroughly as possible, thus our workflow ensures the process is easy and rewarding for the reviewers.
3. Save newcomers' time. When new developers join the team, they want to know how the code evolved and why certain design decisions were made. Our workflow encourages exhaustive commit messages that describe the reason behind each change.

Although the policy may seem too restrictive, it is usually quite easy to follow. It may require you to learn git a bit deeper than you're used to — please follow along, we'll show the necessary commands :)

## Configure your git

By default, git merges the upstream changes into your local branch on pull. This **silently** [spoils your history](1) and may introduce unnecessary merge conflicts that are hard to solve and reason about. We encourage you to turn off this feature by running `git config --global pull.ff only`.

[1]: https://blog.sffc.xyz/post/185195398930/why-you-should-use-git-pull-ff-only-git-is-a

## Create a feature branch

1. Prefer to base your feature branches on master. If it is not possible, make sure to **not include** someone else's commits in your PR later.
2. Prefer short and descriptive names for branches (good: `polynomial-interest-curve`, bad: `fix-rate`).
3. Use lowercase words separated by dashes (good: `xvs-vault`, bad: `XVSVault`).
4. You may include work type into the branch name (ok: `feature/polynomial-interest-curve`).
5. Make sure no-one else works in your feature branch.

## Make commmits

1. The commits should be self-contained and solve one specific problem. Avoid commits incorporating several completely unrelated changes. You can use `git add -p <file>` to stage just a part of the file.
1. The commit messages should have a header and a body. Forget about commit -m.
1. The commit header should describe the change in no longer than 60 characters.
1. The commit body should describe the reason for the change (ideally, describe the problem you're solving, and then the solution you're proposing).
1. Avoid messages that look like "Update file.js" — these do not contain any additional information, the reviewers can easily look up the list of the updated files in the diff. Rather, focus on why you're making the change.

## Prettify your history

Once you have made your changes, it's time to present them to the reviewers. It is quite important that the reviewers only see the relevant up-to-date changes structured by commits.

1. While you've been working on your feature branch, the master branch has most likely evolved. Rebase your changes on top of master by running `git rebase --onto master <parent>`, where `<parent>` is the hash of the commit _immediately preceding_ your first commit. You can find `<parent>` by looking at the history: `git log --oneline`.
2. Your feature branch should have linear history. No merge commits are allowed.
3. The commits in your PR should not solve the problems introduced in your previous commits. The reviewers often look at the code commit by commit, and they may comment on the problems you later solve. By making sure your commits are self-contained, you free the reviewers of unnecessary work. Use the interactive rebase feature (`git rebase -i <parent>`) to squash, reorder or drop your commits.

## Notes on force pushing

When you rewrite your history, GitHub will refuse to accept your changes. This is to protect you from wiping out someone else's contributions. We need to follow certain rules to make sure our history is clean and the others' contributions are intact.

1. Every feature branch should have one active maintainer. No-one else is allowed to directly commit to your feature branch.
2. You can safely force-push to your feature branch. If your colleague wants to contribute, ask them to push their changes into a separate branch, and then cherry-pick. If you want to help your colleague, push your changes to a separate branch and let your colleague cherry-pick. This would help you to avoid any potential conflicts stemming from force-pushing.
3. **Always** use `--force-with-lease` and not `--force`/`-f` to force-push. Things happen, and someone may violate the “one active maintainer” rule. Force with lease would save you the trouble of recovering someone's work :)
4. **Never** force-push to master or any branch that has several maintainers. The only exception to this rule is when a secret (API key, private key, etc.) is accidentially committed, in which case you should immediately wipe it out and notify the security team as soon as possible.

## Make a pull request

1. Make sure your commit history follows the guidelines written above. Rebase once again if necessary.
2. If your PR is work in progress, explicitly mark it as WIP.

## Pass the review

1. During the review, your history does not need to satisfy the criteria above. The reviewers are interested in how you have addressed their comments, so do not squash your fixes with your previous commits during the review. You can use `git commit --fixup <target_commit>` to make a fix to a specific commit.
2. Avoid fixing up a fixup :)
3. After addressing all of the review comments, rebase your work so that the commits are self-contained again. You can use `git rebase -i --autosquash` to squash the fixup commits into the target commits automatically.
4. Do not add any new changes to the code after the review (except for squashing and reordering the commits).

## Closing thoughts

This policy may require some time and effort: writing lenghty commit messages and doing an interactive rebase isn't as straightforward as `git commit -am`. This pays out quickly, however. When you do `git bisect` to find a bug, you'd really appreciate descriptive commits instead of just "Update file" or "Some fixes". When you're reviewing a PR, you can limit the mental burden by looking at individual commits instead of diving straight into 40 files changed. When you're a newcomer and wonder why a function you wanted to use suddenly disappeared before you fully understood the code, you'll be happy to see the reason straight in `git log`. The same goes for when you `git blame` to understand why a certain line of code is written the way it is.

If we were to summarize everything written above into just three bullet points, we'd go with:

- **Always** describe the reason for your changes in commit messages like you're talking with the 5-year-old.
- Leave only meaningful changes in your PR history. Git history can't and shouldn't encompass everything, just like your school history textbook.
- Choose **only one** person responsible for a feature. Avoid unnecessary interference.

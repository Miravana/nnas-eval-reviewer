# nnas-eval-reviewer

**DO NOT COMMIT REAL REVIEW PACKETS, MODEL OUTPUTS, HIDDEN ANNOTATIONS, OR HUMAN SUBMISSIONS TO THIS REPOSITORY.**

`nnas-eval-reviewer is a client implementation of versioned NNAS evaluation contracts. It is not the normative definition of those contracts.`

This is a static, browser-only independent review terminal. The reviewer imports an assigned JSON packet, records structured judgments, finalizes, and downloads an `nnas-eval-human-submission/1` JSON file for the experiment administrator. The main NNAS repository performs authoritative verification and import. The site computes no benchmark scores.

## Supported contracts

- `nnas-eval-reviewer-packet/1`
- `nnas-eval-review-projection/1`
- `nnas-eval-human-review/1`
- `nnas-eval-human-submission/1`
- Judgments use `nnas-eval-reviewed-input/1` payload categories.

For local verification, point `NNAS_MAIN` to the main repository and consult `evaluations/v1/review/human_submission.py`, `evaluations/v1/review/HUMAN_REVIEW_PROTOCOL.md`, `evaluations/v1/review_projection.py`, and `evaluations/v1/scoring/reviewed_input.py` there. The main repository remains authoritative if this client and Python disagree.

## Reviewer workflow

1. Open the site and select **Load review packet**. Enter the pseudonymous ID printed on your assignment. No account, real name, or email is needed.
2. Read the exact raw delivered answer and structured answer. Select any raw assertions, qualifications, or authority statements in the read-only text box and record them as Unicode spans. Lock the occurrence inventory.
3. Open pinned reference material. The read-only **Complete imported packet** section then displays every packet field, including the procedure text and pinned annotation. Inspect the visible source panel and exact source spans. Record any raw/structured discrepancy without deciding which representation wins.
4. Review evidence eligibility, claims, citations, required reference coverage, question targets, and applicable secondary endpoints. Every judgment binds one or more exact answer occurrences. A selected `unable_to_determine`, `unknown`, or `not_evaluable` value is an intentional category; a blank required item blocks finalization.
5. Read the completion list, choose overall uncertainty, provide notes, and select **Finalize review**. The summary becomes read only. Select **Download submission JSON** and return the file through the administrator's approved channel.

The interface follows the protocol's answer-first ordering. It does not accept peer submissions or provide an adjudication mode. A browser refresh or reset loses unfinished work.

The authoritative procedure text in current assignments names Baseline A. Because the interface displays all packet fields, the reviewer can see that label after locking the answer inventory. The administrator should account for this limit when describing reviewer blinding.

## Privacy and integrity

Packet and submission data stay in browser memory until reset, refresh, or download. No reviewer content is sent to GitHub. There is no analytics, telemetry, external API, network submission endpoint, server-side storage, `fetch()`, browser storage, or service worker. The static JavaScript and fabricated fixtures load from GitHub Pages; packet handling and export then use no network.

Import checks the supported packet version; packet, annotation, rubric, procedure and visible task fingerprints; response identity; required inventories; annotation span offsets; and document continuity. The imported packet is deeply frozen in application state. SHA-256 uses Web Crypto with sorted-key compact UTF-8 JSON, preserving array order and exact strings. Raw answer occurrence hashes use exact UTF-8; offsets are zero-based, end-exclusive Unicode code points. No submission fingerprint field exists in `nnas-eval-human-submission/1`; the file itself can be hashed by the administrator.

**Verification limit:** The packet intentionally omits the projection audit view and full pilot task, so the browser cannot independently recompute `projection_fingerprint`, `task_fingerprint`, `evaluation_record_fingerprint`, or `scoring_fingerprint`. It checks their shape and verifies packet content against the binding where possible. The administrator must run the normative Python validator against the retained projection and task. JSON numeric lexical distinctions such as `1` versus `1.0` may cause a packet hash mismatch; the client refuses such a packet rather than altering it.

## Local tests

Requirements: Node.js with Web Crypto and, for Python compatibility, the main NNAS repository with its existing Python dependencies. No npm packages are needed.

```sh
npm test
NNAS_MAIN=/absolute/path/to/NNAS_v0.5_Prototype1_Candidate PYTHONDONTWRITEBYTECODE=1 /path/to/nnas-python tests/compat.py
```

To regenerate the **fabricated** fixtures from the current main implementation:

```sh
NNAS_MAIN=/absolute/path/to/NNAS_v0.5_Prototype1_Candidate PYTHONDONTWRITEBYTECODE=1 /path/to/nnas-python tests/generate-fixtures.py
```

For a local browser check, serve this directory as static files (for example, `python3 -m http.server 8000`) and open `http://localhost:8000`. Import `fixtures/FABRICATED_valid_packet.json`. The unsupported fixture must be rejected.

## Publish with GitHub Pages

1. Review `git status` and ensure only generic application code and `FABRICATED_` fixtures are staged.
2. Commit and push the `main` branch to a public GitHub repository for this client.
3. In repository **Settings → Pages → Build and deployment**, set **Source** to **GitHub Actions**.
4. Run **Actions → Deploy static reviewer → Run workflow**, or push to `main`. The workflow uses official Pages actions and requires no paid service.

The workflow assembles only `index.html`, `css/`, `js/`, and `fixtures/` into the static artifact. Do not place private data in those paths. The `.gitignore` excludes common packet and submission paths, but it cannot protect against deliberate staging (`git add -f`) or unexpected filenames; inspect staged files before pushing.

Before a real assignment, the administrator must create the packet with `make_reviewer_packet`, retain the corresponding task/projection and exact bindings, arrange two independent human reviewers and a distinct adjudicator under the protocol, establish a secure out-of-band return channel, and verify every returned file using normative Python. Browser use alone cannot attest identity or independence.

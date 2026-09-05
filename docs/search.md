# Search semantics

Search matches individual messages and groups hits by session. Bare terms are
AND-ed; quoted text is a phrase. Uppercase `NOT` and leading `-` negate the
following expression; uppercase `OR` and `|` express alternatives. Precedence is
NOT, AND, OR. Parentheses override precedence. Backslash escapes the next
character, including quotes, backslashes and operators. Lowercase `or` and
`not` are ordinary terms. Empty queries, empty/unclosed quotes, dangling
operators/escapes and unmatched parentheses are usage errors. Queries have a
4096-character, 256-token and 32-level nesting budget.

The initial full-text configuration is `simple`: identifiers and technical
words retain their forms; `running` does not match `run`. PostgreSQL still
parses punctuation, so FTS is not literal substring search. Phrase matching
uses PostgreSQL lexeme positions. The fixture comparison with `english` must
be recorded before the discovery gate is considered complete.

Results rank by the best matching message, then message timestamp descending,
then session id. Filters apply before ranking: remote, author, branch,
since (inclusive), until (exclusive), kind and mine. Pagination uses opaque
cursors. Defaults: 20 sessions (maximum 100), context 0 (maximum 10 each side),
500 characters per snippet. Snippets are plain text, never trusted HTML.

Regex mode uses PostgreSQL POSIX advanced regular expressions, not JavaScript
regex; case-insensitive by default, `caseSensitive` enables `~` instead of
`~*`. Invalid patterns return 400. The server enforces a statement timeout
and returns 408 without partial results; narrow project/time filters and try
again. A trigram index does not make patterns without extractable trigrams
cheap. Regex queries share the 4096-character input cap.

CLI read output is bounded; exit 0 means results/success, 1 means no results,
2 means invalid usage or a failed request. JSON is machine-readable; TSV
escapes tabs and newlines. Unknown token usage is null, never an assumed zero.

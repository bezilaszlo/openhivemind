// A git hook (lefthook's pre-commit) exports GIT_DIR/GIT_INDEX_FILE/GIT_WORK_TREE into the
// process env. Tests that spawn their own `git init` in a temp directory must not inherit
// them, or the nested git calls resolve against the real repository instead of the fixture,
// e.g. "remote origin already exists" when the temp repo tries to add its own origin.
delete process.env.GIT_DIR;
delete process.env.GIT_INDEX_FILE;
delete process.env.GIT_WORK_TREE;

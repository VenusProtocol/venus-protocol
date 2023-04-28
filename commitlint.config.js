module.exports = {
  extends: ["@commitlint/config-conventional"],
  ignores: [commit => commit.includes("[skip ci]"), commit => commit.includes("Merge pull request")],
};

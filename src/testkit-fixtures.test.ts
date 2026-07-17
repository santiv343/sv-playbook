export const testGitignore = '.svp/\n.svp-session\ndocs/packets/\nplaybook.config.json\n';

export const testConfig = JSON.stringify({
  verifyCommand: '',
  tasks: {
    complexityCheckpoint: { enabled: false, requireDecisionForTypes: [], requireDecisionForPaths: [] },
  },
});

export const GIT_ARG_CONFIG = 'config';
export const GIT_ARG_ADD = 'add';
export const GIT_ARG_COMMIT = 'commit';
export const GIT_ARG_INITIAL_MESSAGE = 'initial';

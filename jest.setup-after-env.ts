// Runs after the test framework is installed (RNTL needs `expect`).
import { configure } from '@testing-library/react-native';

// The first render in a suite can take seconds on a cold cache (CI); don't let waitFor/findBy give up at 1 s.
configure({ asyncUtilTimeout: 5000 });

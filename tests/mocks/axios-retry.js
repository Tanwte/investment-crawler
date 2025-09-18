// Mock for axios-retry - just returns a function that does nothing
function axiosRetry(axiosInstance, config) {
  // In tests, just do nothing - axios mock will handle requests
  return axiosInstance;
}

axiosRetry.exponentialDelay = function() {
  return 100; // Simple delay for tests
};

module.exports = axiosRetry;
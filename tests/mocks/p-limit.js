// Mock for p-limit - returns a simple function that executes tasks immediately
module.exports = function pLimit(concurrency) {
  return async function(task) {
    return await task();
  };
};
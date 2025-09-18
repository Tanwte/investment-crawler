// Mock for robots-parser
class RobotsParser {
  constructor(robotsText) {
    this.robots = robotsText;
  }
  
  isAllowed(userAgent, url) {
    return true; // Allow everything in tests
  }
  
  isDisallowed(userAgent, url) {
    return false; // Allow everything in tests  
  }
}

module.exports = function(robotsText, userAgent) {
  return new RobotsParser(robotsText);
};
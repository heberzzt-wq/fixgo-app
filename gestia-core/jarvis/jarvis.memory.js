const memory = {
  lastCommand: null,
  lastResult: null
};

export function saveMemory(command, result) {
  memory.lastCommand = command;
  memory.lastResult = result;
}

export function getMemory() {
  return memory;
}
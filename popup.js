let isPaused = false;

const pausePlayButton = document.getElementById('pausePlayButton');
pausePlayButton.addEventListener('click', () => {
  isPaused = !isPaused;
  pausePlayButton.textContent = isPaused ? 'Turn ON' : 'Turn OFF';
  pausePlayButton.style.backgroundColor = isPaused ? 'green' : 'red';
  console.log(isPaused ? 'Script paused.' : 'Script resumed.');

  // Send a message to the content script
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    chrome.tabs.sendMessage(tabs[0].id, { isPaused });
  });
});

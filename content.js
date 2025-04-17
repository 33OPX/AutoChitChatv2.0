// Variables
let hasClickedStart = false;
let isPaused = false;
let inactivityTimer = null;
let lastMessageTime = null;
const INACTIVITY_LIMIT = 30000;
let isSkipping = false;
let blockedUsernames = [];
let userMessageDetected = false;
let autoTurnBackOn = true;
let isInChat = false;
let eventListenersAttached = false;

// Variables for chat state tracking
let lastPath = window.location.pathname;
let wasPausedByUserMessage = false;
let lastChatId = null;
let lastStartButtonState = false;
let chatHistory = []; // Array to store chat history
const MAX_HISTORY = 25; // Maximum number of chats to remember

// Load blocked usernames from storage
function loadBlockedUsernames() {
  chrome.storage.local.get(['blockedUsernames'], function(result) {
    if (result.blockedUsernames) {
      blockedUsernames = result.blockedUsernames;
      console.log('Loaded blocked usernames:', blockedUsernames);
    }
  });
}

// Save blocked usernames to storage
function saveBlockedUsernames() {
  chrome.storage.local.set({ 'blockedUsernames': blockedUsernames }, function() {
    console.log('Saved blocked usernames:', blockedUsernames);
  });
}

// Add username to blocked list
function addToBlockedList(username) {
  if (username && !blockedUsernames.includes(username)) {
    blockedUsernames.push(username);
    saveBlockedUsernames();
    console.log('Added to blocked list:', username);
  }
}

// Function to click a button by text content
function clickButton(buttonText) {
  try {
    const button = Array.from(document.querySelectorAll('button')).find(button => button.textContent.includes(buttonText));
    if (button) {
      console.log(`${buttonText} button found, clicking...`);
      button.click();
      return true;
    } else {
      console.log(`${buttonText} button not found.`);
      return false;
    }
  } catch (error) {
    console.error(`Error clicking ${buttonText} button:`, error);
    return false;
  }
}

// Click-specific button functions
const clickSkipButton = () => clickButton("SKIP");
const clickConfirmButton = () => clickButton("CONFIRM?");
const clickStartButton = () => {
  const success = clickButton("START");
  if (success) hasClickedStart = true;
  return success;
};

// Extract username from chat
function extractUsername() {
  try {
    // First, look for the specific username we want to block
    const targetUsername = "flash bullhorn3";
    const targetUsernameWithAt = "@flash bullhorn3";
    
    // Look for elements containing the exact username
    const allElements = document.querySelectorAll('*');
    for (const element of allElements) {
      const text = element.textContent.trim();
      if (text === targetUsername || text === targetUsernameWithAt) {
        return text;
      }
    }
    
    // If not found, look for elements that might contain the username
    for (const element of allElements) {
      const text = element.textContent.trim();
      if (text.includes(targetUsername) || text.includes(targetUsernameWithAt)) {
        return text;
      }
    }
    
    // Look for "You are now chatting with" text which often precedes the username
    const chatElements = Array.from(document.querySelectorAll('*')).filter(el => 
      el.textContent.includes("You are now chatting with")
    );
    
    if (chatElements.length > 0) {
      const chatText = chatElements[0].textContent;
      const match = chatText.match(/You are now chatting with (.*?)\./);
      if (match && match[1]) {
        return match[1].trim();
      }
    }
    
    // Look for username in the chat header or title
    const headerElements = document.querySelectorAll('h1, h2, h3, .chat-title, .username');
    for (const element of headerElements) {
      const text = element.textContent.trim();
      if (text && !text.includes("Get Premium") && !text.includes("Unlock chat filters")) {
        return text;
      }
    }
    
    return null;
  } catch (error) {
    console.error("Error extracting username:", error);
    return null;
  }
}

// Check for unwanted messages
function checkMessages() {
  try {
    const messages = Array.from(document.querySelectorAll('li.select-text p')).map(p => p.textContent.trim());
    const maleRegex = /\bmale\b|\b[Mm]\b/;
    const numberAttachedRegex = /\b\d+[Mm]\b|\b[Mm]\d+\b/;

    // Check if any message contains "m" or "male"
    const hasMaleReference = messages.some(msg => maleRegex.test(msg) || numberAttachedRegex.test(msg));
    
    if (hasMaleReference) {
      // Extract and block the username
      const username = extractUsername();
      if (username) {
        addToBlockedList(username);
      }
      return true;
    }

    return false;
  } catch (error) {
    console.error("Error checking messages:", error);
    return false;
  }
}

// Check if current chat is with a blocked username
function isBlockedUsername() {
  const currentUsername = extractUsername();
  if (currentUsername && blockedUsernames.includes(currentUsername)) {
    console.log(`Skipping chat with blocked username: ${currentUsername}`);
    return true;
  }
  return false;
}

// Check button state and perform actions
function checkButtonAndMessages() {
  if (!isPaused && (checkMessages() || isBlockedUsername())) {
    console.log("Found message with M, m, male, or blocked username. Performing SKIP -> CONFIRM? -> START...");
    isSkipping = true;
    updateButtonStatus();
    
    clickSkipButton();
    setTimeout(() => {
      clickConfirmButton();
      setTimeout(() => {
        clickStartButton();
        setTimeout(() => {
          isSkipping = false;
          updateButtonStatus();
        }, 1000);
      }, 1000);
    }, 1000);
  }
}

// Check if chat is skipped and restart if needed
function checkIfSkipped() {
  const startButton = Array.from(document.querySelectorAll('button')).find(button => 
    button.textContent.includes('START')
  );
  
  const hasStartButton = !!startButton;
  
  // If Start button appears and we were in a chat before, this means the previous chat ended
  if (hasStartButton && !lastStartButtonState && isInChat) {
    console.log('Chat ended - Start button appeared');
    hasClickedStart = false;
    isInChat = false;
    
    // Add the chat to history
    const username = extractUsername();
    if (username) {
      addToChatHistory(username);
    }
    
    // If script is paused and auto turn back on is enabled, resume it
    if (isPaused && autoTurnBackOn) {
      console.log('Auto-resuming script for new chat');
      togglePausePlay();
    }
  }
  
  // If we have a Start button and haven't clicked it yet
  if (startButton && !hasClickedStart) {
    console.log("START button is visible, starting new chat.");
    isSkipping = true;
    updateButtonStatus();
    
    clickStartButton();
    setTimeout(() => {
      isSkipping = false;
      updateButtonStatus();
    }, 1000);
  }
  
  lastStartButtonState = hasStartButton;
}

// Reset inactivity timer
function resetInactivityTimer() {
  if (inactivityTimer) clearTimeout(inactivityTimer);
  if (!isPaused) {
    inactivityTimer = setTimeout(() => {
      console.log("No activity for 30 seconds. Skipping chat...");
      isSkipping = true;
      updateButtonStatus();
      
      clickSkipButton();
      setTimeout(() => {
        clickConfirmButton();
        setTimeout(() => {
          clickStartButton();
          setTimeout(() => {
            isSkipping = false;
            updateButtonStatus();
          }, 1000);
        }, 1000);
      }, 1000);
    }, INACTIVITY_LIMIT);
  }
}

// Monitor messages for inactivity reset
function monitorMessages() {
  const messages = document.querySelectorAll('li.select-text p');
  if (messages.length) {
    const lastMessage = messages[messages.length - 1];
    const messageTime = new Date();

    if (!lastMessageTime || messageTime > lastMessageTime) {
      lastMessageTime = messageTime;
      resetInactivityTimer();
    }
  }
}

// Update button status with loading indicator
function updateButtonStatus() {
  const pausePlayButton = document.getElementById('pausePlayButton');
  if (!pausePlayButton) return;
  
  if (isSkipping) {
    pausePlayButton.innerHTML = '<span class="loading-dots">Skipping</span>';
    pausePlayButton.style.backgroundColor = '#ff9800';
  } else if (isPaused) {
    pausePlayButton.textContent = 'Turn ON';
    pausePlayButton.style.backgroundColor = 'green';
  } else {
    pausePlayButton.textContent = 'Turn OFF';
    pausePlayButton.style.backgroundColor = 'red';
  }
}

// Toggle pause/play functionality
function togglePausePlay() {
  isPaused = !isPaused;
  updateButtonStatus();
  console.log(isPaused ? "Script paused." : "Script resumed.");

  if (isPaused && inactivityTimer) {
    clearTimeout(inactivityTimer);
    console.log("Inactivity timer cleared.");
  } else if (!isPaused) {
    resetInactivityTimer();
  }
}

// Create a toggle button in the UI
function createPausePlayButton() {
  // Check if the button already exists, if not, create it
  const existingButton = document.getElementById('pausePlayButton');
  if (existingButton) return;

  // Create container for button and loading animation
  const buttonContainer = document.createElement('div');
  buttonContainer.id = 'buttonContainer';
  
  // Create grid container for buttons
  const gridContainer = document.createElement('div');
  gridContainer.style.display = 'grid';
  gridContainer.style.gridTemplateColumns = '1fr 1fr';
  gridContainer.style.gap = '7px';
  gridContainer.style.width = '100%';
  
  // Create checkbox for auto turn back on
  const autoTurnBackOnContainer = document.createElement('div');
  autoTurnBackOnContainer.style.display = 'flex';
  autoTurnBackOnContainer.style.alignItems = 'center';
  autoTurnBackOnContainer.style.gap = '4px';
  autoTurnBackOnContainer.style.padding = '6px 8px';
  autoTurnBackOnContainer.style.backgroundColor = '#4CAF50';
  autoTurnBackOnContainer.style.borderRadius = '4px';
  autoTurnBackOnContainer.style.boxShadow = '0 1px 3px rgba(0,0,0,0.2)';
  
  const autoTurnBackOnCheckbox = document.createElement('input');
  autoTurnBackOnCheckbox.type = 'checkbox';
  autoTurnBackOnCheckbox.id = 'autoTurnBackOnCheckbox';
  autoTurnBackOnCheckbox.checked = autoTurnBackOn;
  autoTurnBackOnCheckbox.style.margin = '0';
  autoTurnBackOnCheckbox.style.width = '12px';
  autoTurnBackOnCheckbox.style.height = '12px';
  autoTurnBackOnCheckbox.addEventListener('change', (event) => {
    autoTurnBackOn = event.target.checked;
    console.log('Auto turn back on:', autoTurnBackOn ? 'enabled' : 'disabled');
  });
  
  const autoTurnBackOnLabel = document.createElement('label');
  autoTurnBackOnLabel.htmlFor = 'autoTurnBackOnCheckbox';
  autoTurnBackOnLabel.textContent = 'Auto On';
  autoTurnBackOnLabel.style.color = 'white';
  autoTurnBackOnLabel.style.fontSize = '11px';
  autoTurnBackOnLabel.style.fontWeight = 'bold';
  autoTurnBackOnLabel.style.cursor = 'pointer';
  
  autoTurnBackOnContainer.appendChild(autoTurnBackOnCheckbox);
  autoTurnBackOnContainer.appendChild(autoTurnBackOnLabel);
  
  // Create the pause/play button
  const pausePlayButton = document.createElement('button');
  pausePlayButton.id = 'pausePlayButton';
  pausePlayButton.textContent = 'Turn OFF';

  // Create match history button with SVG icon
  const matchHistoryButton = document.createElement('button');
  matchHistoryButton.id = 'matchHistoryButton';
  matchHistoryButton.style.padding = '6px 8px';
  matchHistoryButton.style.backgroundColor = '#FFD700';
  matchHistoryButton.style.color = 'black';
  matchHistoryButton.style.border = 'none';
  matchHistoryButton.style.borderRadius = '4px';
  matchHistoryButton.style.cursor = 'pointer';
  matchHistoryButton.style.fontSize = '11px';
  matchHistoryButton.style.fontWeight = 'bold';
  matchHistoryButton.style.boxShadow = '0 1px 3px rgba(0,0,0,0.2)';
  matchHistoryButton.style.transition = 'all 0.3s ease';
  matchHistoryButton.style.display = 'flex';
  matchHistoryButton.style.alignItems = 'center';
  matchHistoryButton.style.gap = '4px';
  matchHistoryButton.style.width = '100%';
  matchHistoryButton.style.justifyContent = 'center';

  // Add SVG icon
  const svgIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svgIcon.setAttribute('stroke', 'currentColor');
  svgIcon.setAttribute('fill', 'currentColor');
  svgIcon.setAttribute('stroke-width', '0');
  svgIcon.setAttribute('viewBox', '0 0 24 24');
  svgIcon.setAttribute('height', '14');
  svgIcon.setAttribute('width', '14');
  svgIcon.style.marginRight = '4px';
  
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M12 2C17.5228 2 22 6.47715 22 12C22 17.5228 17.5228 22 12 22C10.298 22 8.69525 21.5748 7.29229 20.8248L2 22L3.17629 16.7097C2.42562 15.3063 2 13.7028 2 12C2 6.47715 6.47715 2 12 2ZM13 7H11V14H17V12H13V7Z');
  
  svgIcon.appendChild(path);
  matchHistoryButton.appendChild(svgIcon);
  matchHistoryButton.appendChild(document.createTextNode('Match History'));
  
  matchHistoryButton.addEventListener('click', () => {
    const historyButtons = document.querySelectorAll('button');
    for (const button of historyButtons) {
      const svg = button.querySelector('svg');
      if (svg && svg.querySelector('path') && svg.querySelector('path').getAttribute('d').includes('M12 2C17.5228')) {
        button.click();
        break;
      }
    }
  });

  // Apply styles to the container
  Object.assign(buttonContainer.style, {
    position: 'fixed',
    bottom: '60px',
    left: '10px',
    zIndex: '9999',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    width: '200px',
  });

  // Apply styles to the pause/play button
  Object.assign(pausePlayButton.style, {
    padding: '6px 8px',
    backgroundColor: 'red',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '11px',
    fontWeight: 'bold',
    boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
    transition: 'all 0.3s ease',
    width: '100%',
    textAlign: 'center',
  });

  // Add hover effect
  pausePlayButton.addEventListener('mouseover', () => {
    if (!isSkipping) {
      pausePlayButton.style.transform = 'scale(1.05)';
      pausePlayButton.style.boxShadow = '0 2px 4px rgba(0,0,0,0.3)';
    }
  });
  
  pausePlayButton.addEventListener('mouseout', () => {
    if (!isSkipping) {
      pausePlayButton.style.transform = 'scale(1)';
      pausePlayButton.style.boxShadow = '0 1px 3px rgba(0,0,0,0.2)';
    }
  });

  // Add click event
  pausePlayButton.addEventListener('click', togglePausePlay);
  
  // Add buttons to grid container in the specified order
  gridContainer.appendChild(pausePlayButton);
  gridContainer.appendChild(autoTurnBackOnContainer);
  gridContainer.appendChild(matchHistoryButton);
  
  // Create blocked users button
  const blockedListButton = document.createElement('button');
  blockedListButton.id = 'blockedListButton';
  blockedListButton.textContent = 'Blocked Users';
  blockedListButton.style.padding = '6px 8px';
  blockedListButton.style.backgroundColor = '#ff4444';
  blockedListButton.style.color = 'white';
  blockedListButton.style.border = 'none';
  blockedListButton.style.borderRadius = '4px';
  blockedListButton.style.cursor = 'pointer';
  blockedListButton.style.fontSize = '11px';
  blockedListButton.style.fontWeight = 'bold';
  blockedListButton.style.boxShadow = '0 1px 3px rgba(0,0,0,0.2)';
  blockedListButton.style.transition = 'all 0.3s ease';
  blockedListButton.style.width = '100%';
  blockedListButton.addEventListener('click', showBlockedList);
  
  gridContainer.appendChild(blockedListButton);
  
  // Add the grid container to the main container
  buttonContainer.appendChild(gridContainer);
  
  // Add the container to the document
  document.body.appendChild(buttonContainer);
  
  // Add CSS for loading animation
  const style = document.createElement('style');
  style.textContent = `
    .loading-dots:after {
      content: '.';
      animation: dots 1.5s steps(5, end) infinite;
    }
    @keyframes dots {
      0%, 20% { content: '.'; }
      40% { content: '..'; }
      60% { content: '...'; }
      80%, 100% { content: ''; }
    }
  `;
  document.head.appendChild(style);
}

// Create a button to view blocked usernames
function createBlockedListButton() {
  const existingButton = document.getElementById('blockedListButton');
  if (existingButton) return;

  const blockedListButton = document.createElement('button');
  blockedListButton.id = 'blockedListButton';
  blockedListButton.textContent = 'Blocked Users';

  Object.assign(blockedListButton.style, {
    padding: '8px 12px',
    backgroundColor: '#ff4444', // Red background
    color: 'white',
    border: 'none',
    borderRadius: '5px',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: 'bold',
    boxShadow: '0 2px 5px rgba(0,0,0,0.2)',
    transition: 'all 0.3s ease',
    marginTop: '10px',
  });

  blockedListButton.addEventListener('click', showBlockedList);
  
  const buttonContainer = document.getElementById('buttonContainer');
  if (buttonContainer) {
    buttonContainer.appendChild(blockedListButton);
  }
}

// Show blocked usernames list
function showBlockedList() {
  // Create modal container
  const modal = document.createElement('div');
  modal.id = 'blockedListModal';
  
  Object.assign(modal.style, {
    position: 'fixed',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    backgroundColor: '#1a1a1a', // Dark background
    padding: '20px',
    borderRadius: '8px',
    boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
    zIndex: '10000',
    maxWidth: '400px',
    width: '90%',
    maxHeight: '80vh',
    overflowY: 'auto',
    color: '#ffffff' // White text
  });
  
  // Create header
  const header = document.createElement('div');
  header.style.display = 'flex';
  header.style.justifyContent = 'space-between';
  header.style.alignItems = 'center';
  header.style.marginBottom = '15px';
  header.style.borderBottom = '1px solid #333';
  header.style.paddingBottom = '10px';
  
  const title = document.createElement('h3');
  title.textContent = 'Blocked Usernames';
  title.style.margin = '0';
  title.style.color = '#ffffff';
  title.style.fontSize = '18px';
  
  const closeButton = document.createElement('button');
  closeButton.textContent = '×';
  closeButton.style.backgroundColor = 'transparent';
  closeButton.style.border = 'none';
  closeButton.style.fontSize = '24px';
  closeButton.style.cursor = 'pointer';
  closeButton.style.color = '#ffffff';
  closeButton.addEventListener('click', () => {
    document.body.removeChild(modal);
  });
  
  header.appendChild(title);
  header.appendChild(closeButton);
  
  // Create content
  const content = document.createElement('div');
  
  // Add manual username input
  const inputContainer = document.createElement('div');
  inputContainer.style.marginBottom = '15px';
  inputContainer.style.display = 'flex';
  inputContainer.style.gap = '10px';
  
  const usernameInput = document.createElement('input');
  usernameInput.type = 'text';
  usernameInput.placeholder = 'Enter username to block';
  usernameInput.style.flex = '1';
  usernameInput.style.padding = '8px';
  usernameInput.style.borderRadius = '4px';
  usernameInput.style.border = '1px solid #333';
  usernameInput.style.backgroundColor = '#2a2a2a';
  usernameInput.style.color = '#ffffff';
  
  const addButton = document.createElement('button');
  addButton.textContent = 'Add';
  addButton.style.backgroundColor = '#4CAF50';
  addButton.style.color = 'white';
  addButton.style.border = 'none';
  addButton.style.borderRadius = '4px';
  addButton.style.padding = '8px 16px';
  addButton.style.cursor = 'pointer';
  
  addButton.addEventListener('click', () => {
    const username = usernameInput.value.trim();
    if (username && !blockedUsernames.includes(username)) {
      blockedUsernames.push(username);
      saveBlockedUsernames();
      usernameInput.value = '';
      refreshBlockedList(content);
    }
  });
  
  inputContainer.appendChild(usernameInput);
  inputContainer.appendChild(addButton);
  content.appendChild(inputContainer);
  
  // Function to refresh the blocked list
  function refreshBlockedList(container) {
    // Remove existing list
    const existingList = container.querySelector('ul');
    if (existingList) {
      existingList.remove();
    }
    
    // Remove existing empty message
    const existingMessage = container.querySelector('p');
    if (existingMessage) {
      existingMessage.remove();
    }
    
    // Remove existing clear button
    const existingClearButton = container.querySelector('button:last-child');
    if (existingClearButton && existingClearButton.textContent === 'Clear All') {
      existingClearButton.remove();
    }
    
    if (blockedUsernames.length === 0) {
      const emptyMessage = document.createElement('p');
      emptyMessage.textContent = 'No blocked usernames yet.';
      emptyMessage.style.color = '#888';
      emptyMessage.style.textAlign = 'center';
      emptyMessage.style.padding = '20px';
      container.appendChild(emptyMessage);
    } else {
      const list = document.createElement('ul');
      list.style.padding = '0';
      list.style.margin = '0';
      list.style.listStyleType = 'none';
      
      blockedUsernames.forEach((username, index) => {
        const item = document.createElement('li');
        item.style.display = 'flex';
        item.style.justifyContent = 'space-between';
        item.style.alignItems = 'center';
        item.style.padding = '12px';
        item.style.borderBottom = '1px solid #333';
        // Alternate background colors
        item.style.backgroundColor = index % 2 === 0 ? '#2a2a2a' : '#333333';
        
        const usernameText = document.createElement('span');
        usernameText.textContent = username;
        usernameText.style.color = '#ffffff';
        usernameText.style.fontSize = '14px';
        
        const removeButton = document.createElement('button');
        removeButton.textContent = 'Remove';
        removeButton.style.backgroundColor = '#ff5252';
        removeButton.style.color = 'white';
        removeButton.style.border = 'none';
        removeButton.style.borderRadius = '4px';
        removeButton.style.padding = '6px 12px';
        removeButton.style.cursor = 'pointer';
        removeButton.style.fontSize = '12px';
        removeButton.addEventListener('click', () => {
          blockedUsernames = blockedUsernames.filter(name => name !== username);
          saveBlockedUsernames();
          refreshBlockedList(container);
        });
        
        item.appendChild(usernameText);
        item.appendChild(removeButton);
        list.appendChild(item);
      });
      
      container.appendChild(list);
      
      // Create clear all button
      const clearButton = document.createElement('button');
      clearButton.textContent = 'Clear All';
      clearButton.style.backgroundColor = '#ff5252';
      clearButton.style.color = 'white';
      clearButton.style.border = 'none';
      clearButton.style.borderRadius = '4px';
      clearButton.style.padding = '10px 20px';
      clearButton.style.marginTop = '15px';
      clearButton.style.cursor = 'pointer';
      clearButton.style.width = '100%';
      clearButton.style.fontSize = '14px';
      clearButton.addEventListener('click', () => {
        blockedUsernames = [];
        saveBlockedUsernames();
        refreshBlockedList(container);
      });
      
      container.appendChild(clearButton);
    }
  }
  
  // Initial list population
  refreshBlockedList(content);
  
  // Assemble modal
  modal.appendChild(header);
  modal.appendChild(content);
  
  // Add overlay
  const overlay = document.createElement('div');
  overlay.style.position = 'fixed';
  overlay.style.top = '0';
  overlay.style.left = '0';
  overlay.style.width = '100%';
  overlay.style.height = '100%';
  overlay.style.backgroundColor = 'rgba(0,0,0,0.7)';
  overlay.style.zIndex = '9999';
  
  // Add to document
  document.body.appendChild(overlay);
  document.body.appendChild(modal);
  
  // Close on overlay click
  overlay.addEventListener('click', () => {
    document.body.removeChild(overlay);
    document.body.removeChild(modal);
  });
}

// Periodically check for the button and create it if it's missing
function ensureButton() {
  setInterval(() => {
    createPausePlayButton();
    createBlockedListButton();
  }, 5000);
}

// Check for chat end messages
function checkForChatEnd() {
  const chatEndMessages = document.querySelectorAll('div.flex.flex-col.items-start.md\\:items-center.md\\:flex-row.gap-2.font-bold');
  for (const message of chatEndMessages) {
    if (message.textContent.includes('skipped this chat')) {
      console.log('Chat end detected - skip message found');
      hasClickedStart = false;
      isInChat = false;
      
      // If script is paused and auto turn back on is enabled, resume it
      if (isPaused && autoTurnBackOn) {
        console.log('Auto-resuming script for new chat');
        togglePausePlay();
      }
      return true;
    }
  }
  return false;
}

// Monitor chat activity
function monitorChat() {
  let lastPath = window.location.pathname;
  let lastLogTime = 0;
  const LOG_COOLDOWN = 5000; // Only log every 5 seconds

  setInterval(() => {
    const currentPath = window.location.pathname;
    const now = Date.now();
    
    // Only log if enough time has passed since last log
    if (now - lastLogTime > LOG_COOLDOWN) {
      console.log('Current path:', currentPath);
      lastLogTime = now;
    }
    
    // Check if we're in a chat
    const chatInput = document.querySelector('textarea, input[type="text"], [contenteditable="true"]');
    const isCurrentlyInChat = !!chatInput;
    
    // If chat state changed
    if (isCurrentlyInChat !== isInChat) {
      if (!isCurrentlyInChat) {
        // Chat ended
        console.log('Chat ended - chat input disappeared');
        hasClickedStart = false;
        userMessageDetected = false;
        
        // Add the chat to history when it ends
        const username = extractUsername();
        if (username) {
          addToChatHistory(username);
        }
      } else {
        // New chat started
        console.log('New chat started');
        hasClickedStart = false;
        lastMessageTime = null;
        resetInactivityTimer();
      }
    }
    
    // Update chat state
    isInChat = isCurrentlyInChat;
    lastPath = currentPath;

    // Always try to detect user messages
    detectUserMessages();
    
    // Check for chat end messages
    checkForChatEnd();

    if (!isPaused) {
      monitorMessages();
      checkButtonAndMessages();
      checkIfSkipped();
    }
  }, 1000);
}

// Modify detectUserMessages to handle auto off
function detectUserMessages() {
  // Find the chat input element - try multiple selectors
  const chatInput = document.querySelector('textarea, input[type="text"], [contenteditable="true"], .chat-input, .message-input');
  if (!chatInput) {
    console.log('Chat input not found, will try again later');
    return;
  }
  
  // Find the send button - try multiple selectors
  const sendButton = document.querySelector('button[type="submit"], .send-button, .submit-button, button:has(svg), button:has(img)');
  if (!sendButton) {
    console.log('Send button not found, will try again later');
    return;
  }
  
  console.log('Chat input and send button found, setting up event listeners');
  
  // Create new event listeners
  const handleInput = () => {
    if (chatInput.value && chatInput.value.trim().length > 0) {
      console.log('User is typing...');
    }
  };
  
  const handleSend = () => {
    console.log('Send button clicked');
    if (chatInput.value && chatInput.value.trim().length > 0) {
      console.log('User sent a message, pausing script...');
      userMessageDetected = true;
      if (!isPaused) {
        togglePausePlay();
      }
    }
  };
  
  const handleKeydown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      console.log('Enter key pressed in chat input');
      if (chatInput.value && chatInput.value.trim().length > 0) {
        console.log('User sent a message with Enter key, pausing script...');
        userMessageDetected = true;
        if (!isPaused) {
          togglePausePlay();
        }
      }
    }
  };
  
  // Remove old listeners and add new ones
  chatInput.removeEventListener('input', handleInput);
  chatInput.removeEventListener('keydown', handleKeydown);
  sendButton.removeEventListener('click', handleSend);
  
  chatInput.addEventListener('input', handleInput);
  chatInput.addEventListener('keydown', handleKeydown);
  sendButton.addEventListener('click', handleSend);
}

// Listen for messages from the popup to toggle pause state
chrome.runtime.onMessage.addListener((message) => {
  if (message.isPaused !== undefined) {
    isPaused = message.isPaused;
    updateButtonStatus();
    console.log(isPaused ? "Script paused." : "Script resumed.");
  }
});

// Add chat to history
function addToChatHistory(username) {
  if (username) {
    // Check if this username is already in history
    const existingIndex = chatHistory.findIndex(chat => chat.username === username);
    if (existingIndex !== -1) {
      // Update timestamp if user exists
      chatHistory[existingIndex].timestamp = new Date().toLocaleString();
      // Move to top of list
      const user = chatHistory.splice(existingIndex, 1)[0];
      chatHistory.unshift(user);
    } else {
      // Add new user to history
      const timestamp = new Date().toLocaleString();
      chatHistory.unshift({ username, timestamp });
      if (chatHistory.length > MAX_HISTORY) {
        chatHistory.pop(); // Remove oldest chat if exceeding limit
      }
    }
    saveChatHistory();
    console.log('Added to chat history:', username);
  }
}

// Save chat history to storage
function saveChatHistory() {
  chrome.storage.local.set({ 'chatHistory': chatHistory }, function() {
    console.log('Saved chat history:', chatHistory);
  });
}

// Load chat history from storage
function loadChatHistory() {
  chrome.storage.local.get(['chatHistory'], function(result) {
    if (result.chatHistory) {
      chatHistory = result.chatHistory;
      console.log('Loaded chat history:', chatHistory);
    }
  });
}

// Show chat history
function showChatHistory() {
  // Create modal container
  const modal = document.createElement('div');
  modal.id = 'chatHistoryModal';
  
  Object.assign(modal.style, {
    position: 'fixed',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    backgroundColor: '#1a1a1a',
    padding: '20px',
    borderRadius: '8px',
    boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
    zIndex: '10000',
    maxWidth: '400px',
    width: '90%',
    maxHeight: '80vh',
    overflowY: 'auto',
    color: '#ffffff'
  });
  
  // Create header
  const header = document.createElement('div');
  header.style.display = 'flex';
  header.style.justifyContent = 'space-between';
  header.style.alignItems = 'center';
  header.style.marginBottom = '15px';
  header.style.borderBottom = '1px solid #333';
  header.style.paddingBottom = '10px';
  
  const title = document.createElement('h3');
  title.textContent = 'Chat History';
  title.style.margin = '0';
  title.style.color = '#ffffff';
  title.style.fontSize = '18px';
  
  const closeButton = document.createElement('button');
  closeButton.textContent = '×';
  closeButton.style.backgroundColor = 'transparent';
  closeButton.style.border = 'none';
  closeButton.style.fontSize = '24px';
  closeButton.style.cursor = 'pointer';
  closeButton.style.color = '#ffffff';
  closeButton.addEventListener('click', () => {
    document.body.removeChild(modal);
  });
  
  header.appendChild(title);
  header.appendChild(closeButton);
  
  // Create content
  const content = document.createElement('div');
  
  if (chatHistory.length === 0) {
    const emptyMessage = document.createElement('p');
    emptyMessage.textContent = 'No chat history yet.';
    emptyMessage.style.color = '#888';
    emptyMessage.style.textAlign = 'center';
    emptyMessage.style.padding = '20px';
    content.appendChild(emptyMessage);
  } else {
    const list = document.createElement('ul');
    list.style.padding = '0';
    list.style.margin = '0';
    list.style.listStyleType = 'none';
    
    chatHistory.forEach((chat, index) => {
      const item = document.createElement('li');
      item.style.display = 'flex';
      item.style.flexDirection = 'column';
      item.style.padding = '12px';
      item.style.borderBottom = '1px solid #333';
      item.style.backgroundColor = index % 2 === 0 ? '#2a2a2a' : '#333333';
      
      const usernameText = document.createElement('span');
      usernameText.textContent = chat.username;
      usernameText.style.color = '#ffffff';
      usernameText.style.fontSize = '14px';
      usernameText.style.marginBottom = '5px';
      
      const timestamp = document.createElement('span');
      timestamp.textContent = chat.timestamp;
      timestamp.style.color = '#888';
      timestamp.style.fontSize = '12px';
      timestamp.style.marginBottom = '10px';
      
      const buttonContainer = document.createElement('div');
      buttonContainer.style.display = 'flex';
      buttonContainer.style.gap = '5px';
      
      const addFriendButton = document.createElement('button');
      addFriendButton.textContent = 'Add Friend';
      addFriendButton.style.flex = '1';
      addFriendButton.style.backgroundColor = '#4CAF50';
      addFriendButton.style.color = 'white';
      addFriendButton.style.border = 'none';
      addFriendButton.style.borderRadius = '4px';
      addFriendButton.style.padding = '6px 12px';
      addFriendButton.style.cursor = 'pointer';
      addFriendButton.style.fontSize = '12px';
      addFriendButton.addEventListener('click', () => {
        // Find and click the Add Friend button in the chat
        const addFriendButtons = document.querySelectorAll('button');
        for (const button of addFriendButtons) {
          if (button.textContent.includes('Add Friend')) {
            button.click();
            break;
          }
        }
      });
      
      const moreButton = document.createElement('button');
      moreButton.innerHTML = '<svg stroke="currentColor" fill="none" stroke-width="0" viewBox="0 0 15 15" height="20" width="20" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" clip-rule="evenodd" d="M3.625 7.5C3.625 8.12132 3.12132 8.625 2.5 8.625C1.87868 8.625 1.375 8.12132 1.375 7.5C1.375 6.87868 1.87868 6.375 2.5 6.375C3.12132 6.375 3.625 6.87868 3.625 7.5ZM8.625 7.5C8.625 8.12132 8.12132 8.625 7.5 8.625C6.87868 8.625 6.375 8.12132 6.375 7.5C6.375 6.87868 6.87868 6.375 7.5 6.375C8.12132 6.375 8.625 6.87868 8.625 7.5ZM12.5 8.625C13.1213 8.625 13.625 8.12132 13.625 7.5C13.625 6.87868 13.1213 6.375 12.5 6.375C11.8787 6.375 11.375 6.87868 11.375 7.5C11.375 8.12132 11.8787 8.625 12.5 8.625Z" fill="currentColor"></path></svg>';
      moreButton.style.backgroundColor = '#666';
      moreButton.style.color = 'white';
      moreButton.style.border = 'none';
      moreButton.style.borderRadius = '4px';
      moreButton.style.padding = '6px 12px';
      moreButton.style.cursor = 'pointer';
      moreButton.style.fontSize = '12px';
      
      buttonContainer.appendChild(addFriendButton);
      buttonContainer.appendChild(moreButton);
      
      item.appendChild(usernameText);
      item.appendChild(timestamp);
      item.appendChild(buttonContainer);
      list.appendChild(item);
    });
    
    content.appendChild(list);
  }
  
  // Assemble modal
  modal.appendChild(header);
  modal.appendChild(content);
  
  // Add overlay
  const overlay = document.createElement('div');
  overlay.style.position = 'fixed';
  overlay.style.top = '0';
  overlay.style.left = '0';
  overlay.style.width = '100%';
  overlay.style.height = '100%';
  overlay.style.backgroundColor = 'rgba(0,0,0,0.7)';
  overlay.style.zIndex = '9999';
  
  // Add to document
  document.body.appendChild(overlay);
  document.body.appendChild(modal);
  
  // Close on overlay click
  overlay.addEventListener('click', () => {
    document.body.removeChild(overlay);
    document.body.removeChild(modal);
  });
}

// Create a button to view chat history
function createHistoryButton() {
  const existingButton = document.getElementById('historyButton');
  if (existingButton) return;

  const historyButton = document.createElement('button');
  historyButton.id = 'historyButton';
  historyButton.textContent = 'Chat History';

  Object.assign(historyButton.style, {
    padding: '8px 12px',
    backgroundColor: '#4a4a4a',
    color: 'white',
    border: 'none',
    borderRadius: '5px',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: 'bold',
    boxShadow: '0 2px 5px rgba(0,0,0,0.2)',
    transition: 'all 0.3s ease',
    marginTop: '10px',
  });

  historyButton.addEventListener('click', showChatHistory);
  
  const buttonContainer = document.getElementById('buttonContainer');
  if (buttonContainer) {
    buttonContainer.appendChild(historyButton);
  }
}

// Create a button to view match history
function createMatchHistoryButton() {
  const existingButton = document.getElementById('matchHistoryButton');
  if (existingButton) return;

  const matchHistoryButton = document.createElement('button');
  matchHistoryButton.id = 'matchHistoryButton';
  matchHistoryButton.textContent = 'Match History';
  matchHistoryButton.style.marginTop = '10px';
  matchHistoryButton.style.padding = '8px 12px';
  matchHistoryButton.style.backgroundColor = '#4a4a4a';
  matchHistoryButton.style.color = 'white';
  matchHistoryButton.style.border = 'none';
  matchHistoryButton.style.borderRadius = '5px';
  matchHistoryButton.style.cursor = 'pointer';
  matchHistoryButton.style.fontSize = '12px';
  matchHistoryButton.style.fontWeight = 'bold';
  matchHistoryButton.style.boxShadow = '0 2px 5px rgba(0,0,0,0.2)';
  matchHistoryButton.style.transition = 'all 0.3s ease';
  
  matchHistoryButton.addEventListener('click', () => {
    const historyButtons = document.querySelectorAll('button');
    for (const button of historyButtons) {
      const svg = button.querySelector('svg');
      if (svg && svg.querySelector('path') && svg.querySelector('path').getAttribute('d').includes('M12 2C17.5228')) {
        button.click();
        break;
      }
    }
  });

  const buttonContainer = document.getElementById('buttonContainer');
  if (buttonContainer) {
    buttonContainer.appendChild(matchHistoryButton);
  }
}

// Initialize the script
window.onload = () => {
  loadBlockedUsernames();
  createPausePlayButton();
  createBlockedListButton();
  createMatchHistoryButton();
  ensureButton();
  monitorChat();
  
  // Set up user message detection after a short delay to ensure elements are loaded
  setTimeout(detectUserMessages, 2000);
  
  // Also check periodically for the chat input and send button
  setInterval(detectUserMessages, 3000);
};

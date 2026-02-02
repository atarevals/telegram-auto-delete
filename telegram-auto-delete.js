// ==UserScript==
// @name         Telegram Auto Delete Chat (Selectable)
// @namespace    https://www.github.com/atarevals
// @version      3.3
// @description  Delete all Telegram chats without pre-loading
// @author       atarevals
// @match        https://web.telegram.org/*
// @grant        none
// ==/UserScript==

(async () => {
  
  const DEBUG = true;
  const delay = ms => new Promise(res => setTimeout(res, ms));
  const log = (...args) => { if (DEBUG) console.log('[TG-AUTO]', ...args); };
  const error = (...args) => { console.error('[TG-AUTO][ERROR]', ...args); };

  // Check if a chat is "Saved Messages"
  function isSavedMessages(chatEl) {
    const title = chatEl.innerText?.trim() || "";
    return /saved messages/i.test(title);
  }

  // Show simple UI
  function showSimpleUI() {
    const wrapper = document.createElement('div');
    wrapper.id = 'tg-clean-ui';
    Object.assign(wrapper.style, {
      position: 'fixed', top: '0', left: '0', zIndex: 99999, width: '100vw', height: '100vh',
      background: 'rgba(0,0,0,0.75)', color: '#fff', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    });

    wrapper.innerHTML = `
      <div style="background:#17212b;padding:40px 35px;border-radius:12px;box-shadow:0 4px 20px rgba(0,0,0,0.5);max-width:450px;border:1px solid #2b5278;">
        <h2 style="margin:0 0 10px 0;text-align:center;color:#fff;font-size:24px;font-weight:500;">Telegram Auto Delete</h2>
        <p style="font-size:14px;text-align:center;margin:5px 0 25px 0;color:#8696a8;">
          This will delete/leave all your chats one by one
        </p>
        
        <label style="font-weight:400;display:flex;align-items:center;font-size:15px;margin:20px 0;justify-content:center;color:#fff;cursor:pointer;">
          <input id="tg-clean-keep-saved" type="checkbox" checked style="margin-right:10px;width:20px;height:20px;cursor:pointer;accent-color:#3390ec;">
          <span>Don't delete <b style="color:#3390ec;">Saved Messages</b></span>
        </label>
        
        <div style="margin-top:25px;display:flex;gap:12px;justify-content:center;">
          <button id="tg-clean-cancel" style="background:#2b5278;color:#fff;border:none;border-radius:8px;padding:12px 28px;font-size:15px;font-weight:500;cursor:pointer;transition:background 0.2s;">Cancel</button>
          <button id="tg-clean-start" style="background:#3390ec;color:#fff;border:none;border-radius:8px;padding:12px 28px;font-size:15px;font-weight:500;cursor:pointer;transition:background 0.2s;">Start Deletion</button>
        </div>
        
        <div style="margin-top:20px;font-size:13px;text-align:center;color:#8696a8;">
          <b>⚠️ This action is irreversible!</b>
        </div>
      </div>
    `;

    // Add hover effects
    const style = document.createElement('style');
    style.textContent = `
      #tg-clean-cancel:hover { background: #3a6794 !important; }
      #tg-clean-start:hover { background: #4a9eff !important; }
    `;
    wrapper.appendChild(style);

    document.body.appendChild(wrapper);
    return wrapper;
  }

  // Show progress UI during deletion
  function showProgressUI() {
    const wrapper = document.createElement('div');
    wrapper.id = 'tg-progress-ui';
    Object.assign(wrapper.style, {
      position: 'fixed', top: '20px', right: '20px', zIndex: 99999,
      background: '#17212b', color: '#fff', padding: '20px 25px',
      borderRadius: '12px', boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      minWidth: '280px', border: '1px solid #2b5278'
    });

    wrapper.innerHTML = `
      <div style="display:flex;align-items:center;margin-bottom:15px;">
        <div style="width:40px;height:40px;border-radius:50%;background:#3390ec;display:flex;align-items:center;justify-content:center;margin-right:12px;">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
        </div>
        <div>
          <div style="font-size:16px;font-weight:500;color:#fff;">Deleting Chats</div>
          <div style="font-size:13px;color:#8696a8;">Please wait...</div>
        </div>
      </div>
      <div style="background:#0e1621;padding:15px;border-radius:8px;font-size:14px;">
        <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
          <span style="color:#8696a8;">Total Deleted:</span>
          <span style="color:#3390ec;font-weight:600;" id="tg-total-count">0</span>
        </div>
        <div style="display:flex;justify-content:space-between;margin-bottom:6px;">
          <span style="color:#8696a8;">📱 DMs:</span>
          <span style="color:#fff;font-weight:500;" id="tg-dm-count">0</span>
        </div>
        <div style="display:flex;justify-content:space-between;margin-bottom:6px;">
          <span style="color:#8696a8;">👥 Groups:</span>
          <span style="color:#fff;font-weight:500;" id="tg-group-count">0</span>
        </div>
        <div style="display:flex;justify-content:space-between;margin-bottom:6px;">
          <span style="color:#8696a8;">📢 Channels:</span>
          <span style="color:#fff;font-weight:500;" id="tg-channel-count">0</span>
        </div>
        <div style="display:flex;justify-content:space-between;">
          <span style="color:#8696a8;">🤖 Bots:</span>
          <span style="color:#fff;font-weight:500;" id="tg-bot-count">0</span>
        </div>
      </div>
      <div style="margin-top:12px;font-size:12px;color:#8696a8;text-align:center;" id="tg-current-chat">
        Starting...
      </div>
    `;

    document.body.appendChild(wrapper);
    return wrapper;
  }

  // Update progress UI
  function updateProgress(counts, currentChat) {
    document.getElementById('tg-total-count').textContent = counts.total;
    document.getElementById('tg-dm-count').textContent = counts.dm;
    document.getElementById('tg-group-count').textContent = counts.group;
    document.getElementById('tg-channel-count').textContent = counts.channel;
    document.getElementById('tg-bot-count').textContent = counts.bot;
    if (currentChat) {
      const maxLength = 35;
      const displayChat = currentChat.length > maxLength ? currentChat.substring(0, maxLength) + '...' : currentChat;
      document.getElementById('tg-current-chat').textContent = `Deleting: ${displayChat}`;
    }
  }

  // Show final results UI
  function showResultsUI(counts, skippedSaved) {
    // Remove progress UI
    const progressUI = document.getElementById('tg-progress-ui');
    if (progressUI) progressUI.remove();

    const wrapper = document.createElement('div');
    wrapper.id = 'tg-results-ui';
    Object.assign(wrapper.style, {
      position: 'fixed', top: '0', left: '0', zIndex: 99999, width: '100vw', height: '100vh',
      background: 'rgba(0,0,0,0.75)', color: '#fff', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    });

    wrapper.innerHTML = `
      <div style="background:#17212b;padding:35px 40px;border-radius:12px;box-shadow:0 4px 20px rgba(0,0,0,0.5);max-width:450px;border:1px solid #2b5278;">
        <div style="text-align:center;margin-bottom:25px;">
          <div style="width:60px;height:60px;border-radius:50%;background:#27ae60;display:flex;align-items:center;justify-content:center;margin:0 auto 15px;">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
          </div>
          <h2 style="margin:0;color:#fff;font-size:24px;font-weight:500;">Deletion Complete!</h2>
        </div>
        
        <div style="background:#0e1621;padding:20px;border-radius:8px;margin-bottom:20px;">
          <div style="display:flex;justify-content:space-between;margin-bottom:15px;padding-bottom:15px;border-bottom:1px solid #2b5278;">
            <span style="color:#8696a8;font-size:16px;">Total Deleted:</span>
            <span style="color:#3390ec;font-weight:600;font-size:18px;">${counts.total}</span>
          </div>
          <div style="display:flex;justify-content:space-between;margin-bottom:10px;">
            <span style="color:#8696a8;">📱 DMs:</span>
            <span style="color:#fff;font-weight:500;">${counts.dm}</span>
          </div>
          <div style="display:flex;justify-content:space-between;margin-bottom:10px;">
            <span style="color:#8696a8;">👥 Groups:</span>
            <span style="color:#fff;font-weight:500;">${counts.group}</span>
          </div>
          <div style="display:flex;justify-content:space-between;margin-bottom:10px;">
            <span style="color:#8696a8;">📢 Channels:</span>
            <span style="color:#fff;font-weight:500;">${counts.channel}</span>
          </div>
          <div style="display:flex;justify-content:space-between;">
            <span style="color:#8696a8;">🤖 Bots:</span>
            <span style="color:#fff;font-weight:500;">${counts.bot}</span>
          </div>
        </div>
        
        ${skippedSaved ? '<div style="background:#2b5278;padding:12px;border-radius:8px;margin-bottom:20px;text-align:center;font-size:13px;color:#8696a8;"><b style="color:#3390ec;">Saved Messages</b> was kept</div>' : ''}
        
        <button id="tg-close-results" style="width:100%;background:#3390ec;color:#fff;border:none;border-radius:8px;padding:12px;font-size:15px;font-weight:500;cursor:pointer;transition:background 0.2s;">
          Close
        </button>
      </div>
    `;

    const style = document.createElement('style');
    style.textContent = `#tg-close-results:hover { background: #4a9eff !important; }`;
    wrapper.appendChild(style);

    document.body.appendChild(wrapper);

    wrapper.querySelector('#tg-close-results').onclick = () => {
      wrapper.remove();
    };
  }

  // Main logic
  async function main() {
    log('Ready to delete chats...');

    // Show simple UI
    const overlay = showSimpleUI();

    // Button handlers
    overlay.querySelector('#tg-clean-cancel').onclick = () => {
      overlay.remove();
      log('Operation cancelled by user');
    };

    overlay.querySelector('#tg-clean-start').onclick = async () => {
      const keepSaved = overlay.querySelector('#tg-clean-keep-saved')?.checked;

      overlay.remove();
      await processAllChats(keepSaved);
    };
  }

  // Detect chat type from button text
  function detectChatType(buttonText) {
    const text = buttonText.toUpperCase();
    if (text.includes('DELETE AND BLOCK') || text.includes('DELETE AND BAN')) return 'bot';
    if (text.includes('LEAVE CHANNEL')) return 'channel';
    if (text.includes('LEAVE GROUP')) return 'group';
    if (text.includes('DELETE FOR ME AND') || text.includes('DELETE CHAT')) return 'dm';
    return 'unknown';
  }

  // Process all chats by continuously deleting the first non-saved chat
  async function processAllChats(keepSaved) {
    const counts = {
      total: 0,
      channel: 0,
      group: 0,
      dm: 0,
      bot: 0,
      unknown: 0
    };
    
    let skippedSaved = false;
    let attempts = 0;
    let consecutiveSkips = 0;
    const maxAttempts = 10000;
    const maxConsecutiveSkips = 5;

    // Show progress UI
    const progressUI = showProgressUI();

    log('Starting deletion process...');

    while (attempts < maxAttempts) {
      attempts++;

      // Find chat list
      const chatList = document.querySelector('.chat-list');
      if (!chatList) {
        error('Chat list not found!');
        break;
      }

      // Get all visible chats
      const allChats = [...chatList.querySelectorAll('.Chat a.ListItem-button')];
      
      if (allChats.length === 0) {
        log('No more chats found!');
        break;
      }

      // Find the first chat that is NOT Saved Messages (if we're keeping it)
      let targetChat = null;
      let chatIndex = 0;

      for (let i = 0; i < allChats.length; i++) {
        if (keepSaved && isSavedMessages(allChats[i])) {
          if (!skippedSaved) {
            log('Found Saved Messages - will skip it');
            skippedSaved = true;
          }
          continue; // Skip this one
        }
        // Found a non-saved chat
        targetChat = allChats[i];
        chatIndex = i;
        break;
      }

      // If no target found, all remaining chats are Saved Messages
      if (!targetChat) {
        if (keepSaved) {
          log('Only Saved Messages remaining - stopping');
        } else {
          log('No chats found - stopping');
        }
        break;
      }

      const title = targetChat.innerText?.trim() || '(No title)';
      log(`Deleting [${counts.total + 1}]: "${title}"`);
      
      // Update progress UI
      updateProgress(counts, title);

      try {
        // Open context menu on the target chat
        targetChat.dispatchEvent(new MouseEvent('contextmenu', {
          bubbles: true,
          cancelable: true,
          view: window
        }));

        await delay(300);

        // Find delete/leave option
        const MENU_OPTIONS = [
          'Delete Chat',
          'Leave Channel',
          'Leave Group'
        ];
        const deleteChatBtn = [...document.querySelectorAll('[role="menuitem"],button,div')]
          .find(el => MENU_OPTIONS.some(txt => el.innerText?.trim() === txt));

        if (!deleteChatBtn) {
          error('Delete/Leave option not found for: ' + title);
          document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true}));
          await delay(500);
          consecutiveSkips++;
          if (consecutiveSkips >= maxConsecutiveSkips) {
            error('Too many consecutive skips - stopping');
            break;
          }
          continue;
        }

        deleteChatBtn.click();
        await delay(300);

        // Find confirmation button - prioritize "DELETE FOR ME AND [USERNAME]" over "DELETE JUST FOR ME"
        const allButtons = [...document.querySelectorAll('button')];
        
        // First, try to find the "DELETE FOR ME AND [USERNAME]" button (for DMs)
        let confirmBtn = allButtons.find(btn => {
          const text = btn.innerText?.trim().toUpperCase() || '';
          return text.includes('DELETE FOR ME AND') && !text.includes('JUST');
        });

        // If not found, look for other confirmation buttons
        if (!confirmBtn) {
          const CONFIRM_OPTIONS = [
            'DELETE AND BLOCK',
            'DELETE CHAT',
            'LEAVE CHANNEL',
            'LEAVE GROUP',
            'Delete and block',
            'Delete and Block'
          ];
          confirmBtn = allButtons.find(btn => 
            CONFIRM_OPTIONS.some(txt => btn.innerText?.trim().toUpperCase() === txt.toUpperCase())
          );
        }

        if (!confirmBtn) {
          error('Confirmation button not found for: ' + title);
          document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true}));
          await delay(1100);
          consecutiveSkips++;
          if (consecutiveSkips >= maxConsecutiveSkips) {
            error('Too many consecutive skips - stopping');
            break;
          }
          continue;
        }

        // Detect chat type from confirmation button
        const chatType = detectChatType(confirmBtn.innerText?.trim() || '');
        
        log(`Found button: "${confirmBtn.innerText?.trim()}" - Type: ${chatType}`);
        
        confirmBtn.click();
        
        // Update counts
        counts.total++;
        counts[chatType]++;
        
        consecutiveSkips = 0; // Reset on success
        log(`✓ Deleted ${chatType}: "${title}" (Total: ${counts.total})`);
        
        // Update UI after successful deletion
        updateProgress(counts, title);
        
        await delay(500);

      } catch (e) {
        error('Exception:', e);
        await delay(2000);
      }
    }

    // Show final results
    log('===== DELETION COMPLETE =====');
    log(`Total chats deleted: ${counts.total}`);
    log(`Breakdown - DMs: ${counts.dm}, Groups: ${counts.group}, Channels: ${counts.channel}, Bots: ${counts.bot}`);
    
    showResultsUI(counts, skippedSaved);
  }

  // Run
  await main();
})();
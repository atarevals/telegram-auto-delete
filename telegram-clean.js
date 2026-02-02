// ==UserScript==
// @name         Telegram Auto Delete Chat (Selectable)
// @namespace    https://www.github.com/atarevals
// @version      2.0
// @description  Scroll to load all Telegram chats and let user select which types to delete/leave.
// @author       atarevals
// @match        https://web.telegram.org/*
// @grant        none
// ==/UserScript==

(async () => {
  
  const DEBUG = true;
  const delay = ms => new Promise(res => setTimeout(res, ms));
  const log = (...args) => { if (DEBUG) console.log('[TG-AUTO]', ...args); };
  const error = (...args) => { console.error('[TG-AUTO][ERROR]', ...args); };

  // Scrolls to bottom and tries to fully load all chats, waiting until no new chats appear for an extended period AND scroll position does not change
  async function scrollToEndOfChats(chatList) {
    let previousCount = 0;
    let unchangedCount = 0;
    let previousScrollHeight = 0;
    let scrollUnchangedCount = 0;
    const maxUnchanged = 5; // require many passes without new data to be sure

    while (true) {
      chatList.scrollTop = chatList.scrollHeight;
      await delay(900);

      const found = chatList.querySelectorAll('.Chat a.ListItem-button').length;
      if (found === previousCount) {
        unchangedCount++;
      } else {
        unchangedCount = 0;
      }
      previousCount = found;

      // Also check if scrollHeight is changing. If not, that's a strong sign all is loaded.
      if (chatList.scrollHeight === previousScrollHeight) {
        scrollUnchangedCount++;
      } else {
        scrollUnchangedCount = 0;
      }
      previousScrollHeight = chatList.scrollHeight;

      // Only break if both are stable for long enough (to avoid missing slow lazy loads)
      if (unchangedCount > maxUnchanged && scrollUnchangedCount > maxUnchanged) break;
    }
    // Optionally scroll to top so user can see all chats

    return [...chatList.querySelectorAll('.Chat a.ListItem-button')];
  }

  // Classify chat type
  function classifyChat(chatEl) {
    // find class 
    
    const title = chatEl.innerText?.trim() || "";

    // Saved Messages
    if (/saved messages/i.test(title)) {
        log('find the SAVED MASSAGE');
        
        return 'saved'
    }
        
    // Detect BOT (could be improved by avatar or subtitle or special icon, but for now check if name contains 'bot')
    if (/bot/i.test(title)) return 'bot';
    const subtitle = chatEl.querySelector('.subtitle')?.innerText?.toLowerCase() || "";
    if (/channel/.test(subtitle)) return 'channel';
    if (/group/.test(subtitle) || /members?/.test(subtitle)) return 'group';
    if (/joined/.test(subtitle)) return 'channel';
    // if 1-to-1, assume dm
    return 'dm'; // fallback default
  }

  // Generate the result HTML UI overlay for chat selection
  function showChatFilterUI(chatInfos) {
    // build summary counts
    const counts = chatInfos.reduce((acc, info) => {
      acc[info.type] = (acc[info.type] || 0) + 1;
      return acc;
    }, {});
    const total = chatInfos.length;

    // UI
    const wrapper = document.createElement('div');
    wrapper.id = 'tg-clean-ui';
    Object.assign(wrapper.style, {
      position: 'fixed', top: '0', left: '0', zIndex: 99999, width: '100vw', height: '100vh',
      background: 'rgba(0,0,0,0.72)', color: '#fff', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center'
    });

    // HTML: info section + buttons
    wrapper.innerHTML = `
      <div style="background:#222;padding:32px 26px;border-radius:12px;box-shadow:0 2px 16px #0007;">
        <h2>Telegram Auto Delete</h2>
        <p><b>Total chats found:</b> ${total}</p>
        <ul style="text-align:left;font-size:15px;margin: 12px 3px 8px 15px">
          <li>Bots: <b>${counts.bot || 0}</b></li>
          <li>Channels: <b>${counts.channel || 0}</b></li>
          <li>Groups: <b>${counts.group || 0}</b></li>
          <li>DMs: <b>${counts.dm || 0}</b></li>
          <li>Saved Messages (kept): <b>${counts.saved || 0}</b></li>
        </ul>
        <label style="font-weight:500;display:inline-flex;align-items:center;font-size:15px;">
          <input id="tg-clean-keep-saved" type="checkbox" checked style="margin-right:7px;">Keep <b>Saved Messages</b>
        </label>
        <div style="margin-top:18px;display:flex;gap:10px; flex-wrap:wrap;justify-content:center;">
          <button class="tg-clean-btn" data-action="bot">Delete <b>Bots</b></button>
          <button class="tg-clean-btn" data-action="channel">Leave <b>Channels</b></button>
          <button class="tg-clean-btn" data-action="group">Leave <b>Groups</b></button>
          <button class="tg-clean-btn" data-action="dm">Delete <b>DMs</b></button>
          <button class="tg-clean-btn" data-action="all" style="background:#c02626;color:#fff;">Delete/Leave <b>ALL</b></button>
        </div>
        <div style="margin-top:14px;font-size:13px;text-align:center;color:#aaa;">
          <b>Once you click a button, irreversible deletion/leave will begin!</b>
        </div>
      </div>
    `;
    // Attach CSS for buttons
    const style = document.createElement('style');
    style.textContent = `.tg-clean-btn { background:#eee; border:none; outline:none; border-radius:7px; padding:9px 19px; font-size:16px; font-weight:600; cursor:pointer; transition:background 0.2s;}
      .tg-clean-btn:hover { background:#ffe2e2; }`;
    wrapper.appendChild(style);

    document.body.appendChild(wrapper);

    return wrapper;
  }

  // Main logic
  async function main() {
    log('Locating chat list...');
    const chatList = document.querySelector('.chat-list');
    if (!chatList) {
      error('Chat list not found!');
      return;
    }

    log('Scrolling to bottom to load all chats...');
    const allChats = await scrollToEndOfChats(chatList);

    log(`Total chats loaded: ${allChats.length}`);

    // Collect chat info objects
    const chatInfos = allChats.map(chatEl => ({
      el: chatEl,
      type: classifyChat(chatEl),
      title: chatEl.innerText?.trim() || '(No title)'
    }));

    // Show UI overlay for user to pick
    // const overlay = showChatFilterUI(chatInfos);

    // Helper for filtering chats to delete/leave
    function getTargets(type, keepSaved) {
      return chatInfos.filter(info => {
        if (keepSaved && info.type === 'saved') return false;
        if (type === 'all') return info.type !== 'saved' || !keepSaved;
        return info.type === type;
      });
    }

    function cleanupUI() {
      if (overlay) overlay.remove();
    }

    // Button click handler
    overlay.querySelectorAll('.tg-clean-btn').forEach(btn => {
      btn.onclick = async () => {
        const actionType = btn.dataset.action;
        const keepSaved = overlay.querySelector('#tg-clean-keep-saved')?.checked;
        const targets = getTargets(actionType, keepSaved);
        if (!targets.length) {
          alert('No chats matched for: ' + actionType);
          return;
        }
        if (!confirm(
          `Are you sure you want to ${actionType === 'all' ? 'delete/leave ALL' : 'delete/leave ' + actionType + ' chats'}?\n` +
          `Chats to process: ${targets.length}`
        )) return;

        cleanupUI();
        await processChats(targets);
      };
    });
  }

  // Given array of chat-info, process deleting/leaving
  async function processChats(chatInfos) {
    for (let i = 0; i < chatInfos.length; i++) {
      try {
        const chat = chatInfos[i].el;
        const title = chatInfos[i].title;
        log(`Processing chat: [${i + 1}/${chatInfos.length}] "${title}"`);

        // Open context menu on the chat item
        chat.dispatchEvent(new MouseEvent('contextmenu', {
          bubbles: true,
          cancelable: true,
          view: window
        }));

        await delay(800);

        // Find the context menu delete or leave option
        const MENU_OPTIONS = [
          'Delete Chat',
          'Leave Channel',
          'Leave Group'
        ];
        const deleteChatBtn = [...document.querySelectorAll('[role="menuitem"],button,div')]
          .find(el => MENU_OPTIONS.some(txt => el.innerText?.trim() === txt));

        if (!deleteChatBtn) {
          error('Delete/Leave option not found in context menu for: ' + title);
          await delay(1800);
          // Try to close context menu with ESC
          document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true}));
          continue;
        }

        log('Delete/Leave option found. Clicking...');
        deleteChatBtn.click();
        await delay(900);

        // Confirm button in modal
        const CONFIRM_OPTIONS = [
          'DELETE AND BLOCK',
          'DELETE CHAT',
          'LEAVE CHANNEL',
          'LEAVE GROUP',
          'Delete and block',
          'Delete and Block'
        ];
        const confirmBtn = [...document.querySelectorAll('button')]
          .find(btn => CONFIRM_OPTIONS.some(txt => btn.innerText?.trim().toUpperCase() === txt.toUpperCase()));

        if (!confirmBtn) {
          error('Delete confirmation button not found for: ' + title + '. Closing modal...');
          document.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true}));
          await delay(1100);
          continue;
        }

        log('Confirming delete/leave...');
        confirmBtn.click();

        log('Chat deleted/left. Waiting...');
        await delay(2300);

      } catch (e) {
        error('Exception caught:', e);
        await delay(2000);
      }
    }
    log('All selected chats processed. Script finished.');
    alert('Operation completed!');
  }

  // Run main…
  await main();
})();

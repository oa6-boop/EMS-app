import { useEffect, useMemo, useState } from "react";
import {
  createGroupConversation,
  createPrivateConversation,
  deleteConversation,
  deleteMessage,
  fetchConversations,
  fetchMessages,
  searchUsers,
  sendMessage,
  updateMessage,
  uploadChatFile,
} from "../api/chatApi";
import { getCurrentUser } from "../api/authApi";

export default function Messages() {
  const token = localStorage.getItem("token");

  const [currentUser, setCurrentUser] = useState(null);

  const [search, setSearch] = useState("");
  const [searchResults, setSearchResults] = useState([]);

  const [conversations, setConversations] = useState([]);
  const [selectedConversation, setSelectedConversation] = useState(null);

  const [messages, setMessages] = useState([]);
  const [messageText, setMessageText] = useState("");

  const [showGroupModal, setShowGroupModal] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [groupSearch, setGroupSearch] = useState("");
  const [groupSearchResults, setGroupSearchResults] = useState([]);
  const [selectedUsers, setSelectedUsers] = useState([]);

  const [editingMessageId, setEditingMessageId] = useState(null);
  const [editingText, setEditingText] = useState("");

  const [pageError, setPageError] = useState("");
  const [pageSuccess, setPageSuccess] = useState("");

  const selectedUserIds = useMemo(
    () => selectedUsers.map((user) => user.id),
    [selectedUsers]
  );

  useEffect(() => {
    const init = async () => {
      try {
        const me = await getCurrentUser(token);
        setCurrentUser(me);
        await loadConversations();
      } catch (error) {
        setPageError(error.message || "Failed to initialize messages page");
      }
    };

    init();
  }, []);

  useEffect(() => {
    if (!selectedConversation) return;

    loadMessages(selectedConversation.id);
    const interval = setInterval(() => {
      loadMessages(selectedConversation.id);
    }, 3000);

    return () => clearInterval(interval);
  }, [selectedConversation]);

  useEffect(() => {
    if (!pageSuccess && !pageError) return;

    const timeout = setTimeout(() => {
      setPageSuccess("");
      setPageError("");
    }, 3000);

    return () => clearTimeout(timeout);
  }, [pageSuccess, pageError]);

  const loadConversations = async () => {
    try {
      const result = await fetchConversations(token);
      setConversations(result || []);
    } catch (error) {
      setPageError(error.message || "Failed to fetch conversations");
    }
  };

  const loadMessages = async (conversationId) => {
    try {
      const result = await fetchMessages(conversationId, token);
      setMessages(result || []);
    } catch (error) {
      setPageError(error.message || "Failed to fetch messages");
    }
  };

  const handleSearch = async (value) => {
    setSearch(value);

    if (!value.trim()) {
      setSearchResults([]);
      return;
    }

    try {
      const result = await searchUsers(value, token);
      setSearchResults(result || []);
    } catch (error) {
      setPageError(error.message || "Failed to search users");
    }
  };

  const handleGroupSearch = async (value) => {
    setGroupSearch(value);

    if (!value.trim()) {
      setGroupSearchResults([]);
      return;
    }

    try {
      const result = await searchUsers(value, token);
      setGroupSearchResults(result || []);
    } catch (error) {
      setPageError(error.message || "Failed to search users");
    }
  };

  const handleStartConversation = async (userId) => {
    try {
      const result = await createPrivateConversation(userId, token);
      const updated = await fetchConversations(token);

      setConversations(updated || []);

      const conv = updated.find((item) => item.id === result.conversation_id);
      setSelectedConversation(conv || null);

      setSearch("");
      setSearchResults([]);
      setPageSuccess("Conversation opened successfully");
    } catch (error) {
      setPageError(error.message || "Failed to open conversation");
    }
  };

  const handleToggleSelectedUser = (user) => {
    setSelectedUsers((prev) => {
      const exists = prev.some((item) => item.id === user.id);
      if (exists) {
        return prev.filter((item) => item.id !== user.id);
      }
      return [...prev, user];
    });
  };

  const handleRemoveSelectedUser = (userId) => {
    setSelectedUsers((prev) => prev.filter((item) => item.id !== userId));
  };

  const handleCreateGroup = async () => {
    if (!groupName.trim()) {
      setPageError("Please enter a group name");
      return;
    }

    if (selectedUsers.length === 0) {
      setPageError("Please select at least one user");
      return;
    }

    try {
      const result = await createGroupConversation(
        {
          name: groupName.trim(),
          user_ids: selectedUserIds,
        },
        token
      );

      const updated = await fetchConversations(token);
      setConversations(updated || []);

      const conv = updated.find((item) => item.id === result.conversation_id);
      setSelectedConversation(conv || null);

      setShowGroupModal(false);
      setGroupName("");
      setGroupSearch("");
      setGroupSearchResults([]);
      setSelectedUsers([]);
      setPageSuccess("Group created successfully");
    } catch (error) {
      setPageError(error.message || "Failed to create group");
    }
  };

  const handleSendMessage = async () => {
    if (!messageText.trim() || !selectedConversation) return;

    try {
      await sendMessage(selectedConversation.id, messageText.trim(), token);
      setMessageText("");
      await loadMessages(selectedConversation.id);
      await loadConversations();
    } catch (error) {
      setPageError(error.message || "Failed to send message");
    }
  };

  const handleMessageKeyDown = async (e) => {
    if (e.key === "Enter") {
      await handleSendMessage();
    }
  };

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !selectedConversation) return;

    try {
      await uploadChatFile(selectedConversation.id, file, token);
      await loadMessages(selectedConversation.id);
      await loadConversations();
      setPageSuccess("File uploaded successfully");
    } catch (error) {
      setPageError(error.message || "Failed to upload file");
    } finally {
      e.target.value = "";
    }
  };

  const handleStartEdit = (message) => {
    setEditingMessageId(message.id);
    setEditingText(message.content || "");
  };

  const handleCancelEdit = () => {
    setEditingMessageId(null);
    setEditingText("");
  };

  const handleSaveEdit = async () => {
    if (!editingText.trim()) {
      setPageError("Message cannot be empty");
      return;
    }

    try {
      await updateMessage(editingMessageId, editingText.trim(), token);
      setEditingMessageId(null);
      setEditingText("");
      await loadMessages(selectedConversation.id);
      setPageSuccess("Message updated successfully");
    } catch (error) {
      setPageError(error.message || "Failed to update message");
    }
  };

  const handleDeleteMessage = async (messageId) => {
    const confirmed = window.confirm("Delete this message?");
    if (!confirmed) return;

    try {
      await deleteMessage(messageId, token);
      await loadMessages(selectedConversation.id);
      await loadConversations();
      setPageSuccess("Message deleted successfully");
    } catch (error) {
      setPageError(error.message || "Failed to delete message");
    }
  };

  const handleDeleteConversation = async () => {
    if (!selectedConversation) return;

    const confirmed = window.confirm("Delete this conversation?");
    if (!confirmed) return;

    try {
      await deleteConversation(selectedConversation.id, token);
      setSelectedConversation(null);
      setMessages([]);
      await loadConversations();
      setPageSuccess("Conversation deleted successfully");
    } catch (error) {
      setPageError(error.message || "Failed to delete conversation");
    }
  };

  const getConversationTitle = (conversation) => {
    if (!conversation) return "";

    if (conversation.type === "group") {
      return conversation.name || "Group conversation";
    }

    const others = conversation.participants?.filter(
      (participant) => participant.email !== currentUser?.email
    );

    if (others?.length) {
      return `${others[0].firstName} ${others[0].lastName}`;
    }

    return "Private chat";
  };

  const isUserSelectedInGroup = (userId) => {
    return selectedUsers.some((user) => user.id === userId);
  };

  return (
    <div className="messages-page">
      <div className="messages-sidebar">
        <div className="messages-actions">
          <button
            type="button"
            onClick={() => {
              setShowGroupModal(false);
              setGroupName("");
              setGroupSearch("");
              setGroupSearchResults([]);
              setSelectedUsers([]);
            }}
          >
            New Conversation
          </button>

          <button
            type="button"
            onClick={() => {
              setShowGroupModal(true);
              setGroupName("");
              setGroupSearch("");
              setGroupSearchResults([]);
              setSelectedUsers([]);
            }}
          >
            Create Group
          </button>
        </div>

        <input
          type="text"
          placeholder="Search by email / first name / last name"
          value={search}
          onChange={(e) => handleSearch(e.target.value)}
          className="messages-search"
        />

        {searchResults.length > 0 && (
          <div className="messages-search-results">
            {searchResults.map((user) => (
              <div
                key={user.id}
                className="messages-user-result"
                onClick={() => handleStartConversation(user.id)}
              >
                <strong>
                  {user.firstName} {user.lastName}
                </strong>
                <span>{user.email}</span>
              </div>
            ))}
          </div>
        )}

        <div className="conversation-list">
          {conversations.length > 0 ? (
            conversations.map((conversation) => (
              <div
                key={conversation.id}
                className={`conversation-item ${
                  selectedConversation?.id === conversation.id ? "active" : ""
                }`}
                onClick={() => setSelectedConversation(conversation)}
              >
                <strong>{getConversationTitle(conversation)}</strong>
                <small>{conversation.type}</small>
                {conversation.lastMessage && (
                  <small>{conversation.lastMessage}</small>
                )}
              </div>
            ))
          ) : (
            <div className="messages-empty-list">No conversations yet.</div>
          )}
        </div>
      </div>

      <div className="messages-content">
        {pageSuccess && <div className="info-box">{pageSuccess}</div>}
        {pageError && <div className="alarm-item">{pageError}</div>}

        {selectedConversation ? (
          <>
            <div className="messages-header">
              <h2>{getConversationTitle(selectedConversation)}</h2>
              <button
                type="button"
                className="delete-conversation-btn"
                onClick={handleDeleteConversation}
              >
                Delete Conversation
              </button>
            </div>

            <div className="messages-list">
              {messages.length > 0 ? (
                messages.map((message) => (
                  <div key={message.id} className="message-bubble">
                    <strong>{message.sender_name}</strong>

                    {editingMessageId === message.id ? (
                      <div className="message-edit-box">
                        <input
                          type="text"
                          value={editingText}
                          onChange={(e) => setEditingText(e.target.value)}
                        />
                        <button type="button" onClick={handleSaveEdit}>
                          Save
                        </button>
                        <button type="button" onClick={handleCancelEdit}>
                          Cancel
                        </button>
                      </div>
                    ) : message.message_type === "text" ? (
                      <p>{message.content}</p>
                    ) : message.file_url ? (
                      <div>
                        <a
                          href={message.file_url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          📄 {message.file_name || "Open file"}
                        </a>
                      </div>
                    ) : (
                      <p>{message.content}</p>
                    )}

                    <small>{new Date(message.created_at).toLocaleString()}</small>

                    <div className="message-actions-row">
                      {message.sender_id === currentUser?.id &&
                        message.message_type === "text" &&
                        editingMessageId !== message.id && (
                          <button
                            type="button"
                            onClick={() => handleStartEdit(message)}
                          >
                            Edit
                          </button>
                        )}

                      {(message.sender_id === currentUser?.id ||
                        selectedConversation?.created_by === currentUser?.id) && (
                        <button
                          type="button"
                          onClick={() => handleDeleteMessage(message.id)}
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <div className="messages-empty">
                  No messages in this conversation yet.
                </div>
              )}
            </div>

            <div className="messages-input-row">
              <input
                type="text"
                placeholder="Type a message..."
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                onKeyDown={handleMessageKeyDown}
              />

              <button type="button" onClick={handleSendMessage}>
                Send
              </button>

              <label className="chat-file-upload-btn">
                Upload
                <input type="file" hidden onChange={handleFileChange} />
              </label>
            </div>
          </>
        ) : (
          <div className="messages-empty">
            Select or start a conversation
          </div>
        )}
      </div>

      {showGroupModal && (
        <div className="forgot-modal-overlay">
          <div className="forgot-modal">
            <h2>Create Group</h2>

            <input
              type="text"
              placeholder="Group name"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
            />

            <input
              type="text"
              placeholder="Search users by email / first name / last name"
              value={groupSearch}
              onChange={(e) => handleGroupSearch(e.target.value)}
            />

            {selectedUsers.length > 0 && (
              <div className="selected-group-users">
                {selectedUsers.map((user) => (
                  <span key={user.id} className="selected-group-user-chip">
                    {user.firstName} {user.lastName}
                    <button
                      type="button"
                      onClick={() => handleRemoveSelectedUser(user.id)}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}

            <div className="group-user-list">
              {groupSearchResults.length > 0 ? (
                groupSearchResults.map((user) => (
                  <div
                    key={user.id}
                    className={`group-user-item clickable ${
                      isUserSelectedInGroup(user.id) ? "selected" : ""
                    }`}
                    onClick={() => handleToggleSelectedUser(user)}
                  >
                    <strong>
                      {user.firstName} {user.lastName}
                    </strong>
                    <span>{user.email}</span>
                  </div>
                ))
              ) : (
                <div className="messages-empty-list">
                  Search users to add them to the group.
                </div>
              )}
            </div>

            <div className="forgot-modal-actions">
              <button
                type="button"
                className="login-btn"
                onClick={handleCreateGroup}
              >
                Create
              </button>
              <button
                type="button"
                className="cancel-forgot-btn"
                onClick={() => {
                  setShowGroupModal(false);
                  setGroupName("");
                  setGroupSearch("");
                  setGroupSearchResults([]);
                  setSelectedUsers([]);
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
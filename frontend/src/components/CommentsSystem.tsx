'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { authFetch } from '@/lib/auth-utils';
import {
  ChatBubbleLeftIcon,
  PaperAirplaneIcon,
  EllipsisVerticalIcon,
  TrashIcon,
  PencilIcon,
  FlagIcon,
  EyeIcon,
  EyeSlashIcon,
  UserIcon,
  ClockIcon
} from '@heroicons/react/24/outline';
import { motion, AnimatePresence } from 'framer-motion';

interface Comment {
  id: string;
  content: string;
  type: 'internal' | 'external';
  authorId: string;
  authorName: string;
  authorRole: string;
  createdAt: string;
  updatedAt?: string;
  isDeleted: boolean;
  parentId?: string;
  replies?: Comment[];
  metadata?: {
    isEdited: boolean;
    editHistory?: Array<{
      content: string;
      editedAt: string;
    }>;
  };
}

interface CommentsSystemProps {
  itemId: string;
  itemType: 'curation_item' | 'image' | 'user';
  readOnly?: boolean;
  showInternal?: boolean;
  className?: string;
}

const CommentsSystem: React.FC<CommentsSystemProps> = ({ 
  itemId, 
  itemType, 
  readOnly = false, 
  showInternal = true,
  className = '' 
}) => {
  const [newComment, setNewComment] = useState('');
  const [commentType, setCommentType] = useState<'internal' | 'external'>('internal');
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [editingComment, setEditingComment] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [showDeletedComments, setShowDeletedComments] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const queryClient = useQueryClient();

  // Fetch comments
  const { data: comments, isLoading, error } = useQuery({
    queryKey: ['comments', itemType, itemId, showInternal],
    queryFn: async () => {
      const params = new URLSearchParams({
        item_type: itemType,
        show_internal: showInternal.toString(),
        include_deleted: showDeletedComments.toString()
      });

      const response = await authFetch(`/api/admin/curation/comments/${itemId}?${params}`);
      if (!response.ok) throw new Error('Failed to fetch comments');
      return response.json();
    }
  });

  // Create comment mutation
  const createCommentMutation = useMutation({
    mutationFn: async ({ content, type, parentId }: { content: string; type: string; parentId?: string }) => {
      const response = await authFetch('/api/admin/curation/comments', {
        method: 'POST',
        body: JSON.stringify({
          item_id: itemId,
          item_type: itemType,
          content,
          type,
          parent_id: parentId
        })
      });
      if (!response.ok) throw new Error('Failed to create comment');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['comments', itemType, itemId] });
      setNewComment('');
      setReplyTo(null);
    }
  });

  // Update comment mutation
  const updateCommentMutation = useMutation({
    mutationFn: async ({ commentId, content }: { commentId: string; content: string }) => {
      const response = await authFetch(`/api/admin/curation/comments/${commentId}`, {
        method: 'PUT',
        body: JSON.stringify({ content })
      });
      if (!response.ok) throw new Error('Failed to update comment');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['comments', itemType, itemId] });
      setEditingComment(null);
      setEditContent('');
    }
  });

  // Delete comment mutation
  const deleteCommentMutation = useMutation({
    mutationFn: async (commentId: string) => {
      const response = await authFetch(`/api/admin/curation/comments/${commentId}`, {
        method: 'DELETE'
      });
      if (!response.ok) throw new Error('Failed to delete comment');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['comments', itemType, itemId] });
    }
  });

  // Flag comment mutation
  const flagCommentMutation = useMutation({
    mutationFn: async ({ commentId, reason }: { commentId: string; reason: string }) => {
      const response = await authFetch(`/api/admin/curation/comments/${commentId}/flag`, {
        method: 'POST',
        body: JSON.stringify({ reason })
      });
      if (!response.ok) throw new Error('Failed to flag comment');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['comments', itemType, itemId] });
    }
  });

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
    }
  }, [newComment]);

  const handleSubmitComment = (e: React.FormEvent) => {
    e.preventDefault();
    if (newComment.trim()) {
      createCommentMutation.mutate({
        content: newComment.trim(),
        type: commentType,
        parentId: replyTo || undefined
      });
    }
  };

  const handleEditComment = (comment: Comment) => {
    setEditingComment(comment.id);
    setEditContent(comment.content);
  };

  const handleSaveEdit = () => {
    if (editingComment && editContent.trim()) {
      updateCommentMutation.mutate({
        commentId: editingComment,
        content: editContent.trim()
      });
    }
  };

  const handleCancelEdit = () => {
    setEditingComment(null);
    setEditContent('');
  };

  const handleReply = (commentId: string) => {
    setReplyTo(commentId);
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  };

  const handleDeleteComment = (commentId: string) => {
    if (confirm('Are you sure you want to delete this comment?')) {
      deleteCommentMutation.mutate(commentId);
    }
  };

  const handleFlagComment = (commentId: string) => {
    const reason = prompt('Please provide a reason for flagging this comment:');
    if (reason && reason.trim()) {
      flagCommentMutation.mutate({ commentId, reason: reason.trim() });
    }
  };

  const getCommentTypeColor = (type: string) => {
    return type === 'internal' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800';
  };

  const getRoleColor = (role: string) => {
    switch (role.toLowerCase()) {
      case 'admin': return 'text-red-600';
      case 'curator': return 'text-blue-600';
      case 'contributor': return 'text-green-600';
      default: return 'text-gray-600';
    }
  };

  const formatTimeAgo = (dateString: string) => {
    const now = new Date();
    const date = new Date(dateString);
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffInSeconds < 60) return 'just now';
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
    if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d ago`;
    return date.toLocaleDateString();
  };

  const CommentComponent = ({ comment, depth = 0 }: { comment: Comment; depth?: number }) => {
    const [showMenu, setShowMenu] = useState(false);
    const isEditing = editingComment === comment.id;

    if (comment.isDeleted && !showDeletedComments) {
      return null;
    }

    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className={`relative ${depth > 0 ? 'ml-8 border-l-2 border-gray-200 pl-4' : ''}`}
      >
        <div className={`bg-white rounded-lg border ${comment.isDeleted ? 'opacity-50' : ''} ${
          comment.type === 'internal' && showInternal ? 'border-blue-200' : 'border-gray-200'
        }`}>
          {/* Comment Header */}
          <div className="px-4 py-3 border-b border-gray-100">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="h-8 w-8 bg-gray-200 rounded-full flex items-center justify-center">
                  <UserIcon className="h-4 w-4 text-gray-500" />
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <span className={`text-sm font-medium ${getRoleColor(comment.authorRole)}`}>
                      {comment.authorName}
                    </span>
                    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${getCommentTypeColor(comment.type)}`}>
                      {comment.type}
                    </span>
                    {comment.metadata?.isEdited && (
                      <span className="text-xs text-gray-500">(edited)</span>
                    )}
                  </div>
                  <div className="flex items-center space-x-2 text-xs text-gray-500">
                    <ClockIcon className="h-3 w-3" />
                    <span>{formatTimeAgo(comment.createdAt)}</span>
                  </div>
                </div>
              </div>

              {!readOnly && (
                <div className="relative">
                  <button
                    onClick={() => setShowMenu(!showMenu)}
                    className="p-1 text-gray-400 hover:text-gray-600 rounded"
                  >
                    <EllipsisVerticalIcon className="h-4 w-4" />
                  </button>

                  {showMenu && (
                    <div className="absolute right-0 top-8 bg-white border border-gray-200 rounded-md shadow-lg z-10 min-w-32">
                      <button
                        onClick={() => {
                          handleReply(comment.id);
                          setShowMenu(false);
                        }}
                        className="block w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                      >
                        Reply
                      </button>
                      <button
                        onClick={() => {
                          handleEditComment(comment);
                          setShowMenu(false);
                        }}
                        className="block w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                      >
                        <PencilIcon className="h-3 w-3 inline mr-2" />
                        Edit
                      </button>
                      <button
                        onClick={() => {
                          handleFlagComment(comment.id);
                          setShowMenu(false);
                        }}
                        className="block w-full px-3 py-2 text-left text-sm text-orange-600 hover:bg-orange-50"
                      >
                        <FlagIcon className="h-3 w-3 inline mr-2" />
                        Flag
                      </button>
                      <button
                        onClick={() => {
                          handleDeleteComment(comment.id);
                          setShowMenu(false);
                        }}
                        className="block w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50"
                      >
                        <TrashIcon className="h-3 w-3 inline mr-2" />
                        Delete
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Comment Content */}
          <div className="px-4 py-3">
            {isEditing ? (
              <div className="space-y-3">
                <textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  className="w-full border border-gray-300 rounded-md p-3 focus:ring-blue-500 focus:border-blue-500 resize-none"
                  rows={3}
                  placeholder="Edit your comment..."
                />
                <div className="flex justify-end space-x-2">
                  <button
                    onClick={handleCancelEdit}
                    className="px-3 py-1 text-sm border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveEdit}
                    disabled={updateCommentMutation.isPending}
                    className="px-3 py-1 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                  >
                    Save
                  </button>
                </div>
              </div>
            ) : (
              <p className={`text-sm ${comment.isDeleted ? 'italic text-gray-500' : 'text-gray-900'}`}>
                {comment.isDeleted ? '[This comment has been deleted]' : comment.content}
              </p>
            )}
          </div>
        </div>

        {/* Replies */}
        {comment.replies && comment.replies.length > 0 && (
          <div className="mt-3 space-y-3">
            {comment.replies.map(reply => (
              <CommentComponent key={reply.id} comment={reply} depth={depth + 1} />
            ))}
          </div>
        )}

        {/* Click outside to close menu */}
        {showMenu && (
          <div
            className="fixed inset-0 z-5"
            onClick={() => setShowMenu(false)}
          />
        )}
      </motion.div>
    );
  };

  if (isLoading) {
    return (
      <div className={`flex justify-center items-center h-32 ${className}`}>
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium text-gray-900 flex items-center">
          <ChatBubbleLeftIcon className="h-5 w-5 mr-2" />
          Comments ({comments?.length || 0})
        </h3>
        
        {comments?.some((c: Comment) => c.isDeleted) && (
          <button
            onClick={() => setShowDeletedComments(!showDeletedComments)}
            className="text-sm text-gray-500 hover:text-gray-700 flex items-center"
          >
            {showDeletedComments ? (
              <>
                <EyeSlashIcon className="h-4 w-4 mr-1" />
                Hide deleted
              </>
            ) : (
              <>
                <EyeIcon className="h-4 w-4 mr-1" />
                Show deleted
              </>
            )}
          </button>
        )}
      </div>

      {/* New Comment Form */}
      {!readOnly && (
        <form onSubmit={handleSubmitComment} className="bg-white rounded-lg border border-gray-200 p-4">
          {replyTo && (
            <div className="mb-3 text-sm text-blue-600 bg-blue-50 p-2 rounded">
              Replying to comment
              <button
                type="button"
                onClick={() => setReplyTo(null)}
                className="ml-2 text-blue-800 hover:text-blue-900"
              >
                ✕
              </button>
            </div>
          )}
          
          <div className="space-y-3">
            <textarea
              ref={textareaRef}
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              className="w-full border border-gray-300 rounded-md p-3 focus:ring-blue-500 focus:border-blue-500 resize-none"
              rows={3}
              placeholder="Add a comment..."
              disabled={createCommentMutation.isPending}
            />
            
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <label className="flex items-center space-x-2">
                  <input
                    type="radio"
                    value="internal"
                    checked={commentType === 'internal'}
                    onChange={(e) => setCommentType(e.target.value as 'internal')}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-700">Internal</span>
                </label>
                <label className="flex items-center space-x-2">
                  <input
                    type="radio"
                    value="external"
                    checked={commentType === 'external'}
                    onChange={(e) => setCommentType(e.target.value as 'external')}
                    className="h-4 w-4 text-green-600 focus:ring-green-500"
                  />
                  <span className="text-sm text-gray-700">External</span>
                </label>
              </div>
              
              <button
                type="submit"
                disabled={!newComment.trim() || createCommentMutation.isPending}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
              >
                <PaperAirplaneIcon className="h-4 w-4 mr-2" />
                {createCommentMutation.isPending ? 'Posting...' : 'Post Comment'}
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Comments List */}
      <div className="space-y-4">
        <AnimatePresence>
          {comments?.filter((comment: Comment) => !comment.parentId).map((comment: Comment) => (
            <CommentComponent key={comment.id} comment={comment} />
          ))}
        </AnimatePresence>
        
        {(!comments || comments.length === 0) && (
          <div className="text-center text-gray-500 py-8">
            <ChatBubbleLeftIcon className="h-12 w-12 mx-auto text-gray-300 mb-3" />
            <p>No comments yet. Be the first to comment!</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default CommentsSystem;

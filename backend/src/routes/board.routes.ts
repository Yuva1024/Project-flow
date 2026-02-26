import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware';
import {
    createBoard,
    getBoards,
    getBoardById,
    updateBoard,
    deleteBoard,
} from '../controllers/board.controller';
import {
    createList,
    getLists,
    updateList,
    deleteList,
} from '../controllers/list.controller';
import {
    createCard,
    getCards,
    getCardById,
    updateCard,
    deleteCard,
} from '../controllers/card.controller';
import {
    reorderLists,
    reorderCards,
} from '../controllers/dnd.controller';
import {
    createComment,
    getComments,
    updateComment,
    deleteComment,
} from '../controllers/comment.controller';
import {
    createLabel,
    getLabels,
    updateLabel,
    deleteLabel,
    assignLabel,
    removeLabel,
} from '../controllers/label.controller';
import {
    createChecklist,
    getChecklists,
    deleteChecklist,
    createChecklistItem,
    updateChecklistItem,
    deleteChecklistItem,
} from '../controllers/checklist.controller';
import {
    assignCardMember,
    getCardMembers,
    removeCardMember,
    getActivityLog,
} from '../controllers/cardmember.controller';

const router = Router({ mergeParams: true });

// All routes require authentication
router.use(requireAuth);

// Board CRUD
router.post('/', createBoard);
router.get('/', getBoards);
router.get('/:boardId', getBoardById);
router.patch('/:boardId', updateBoard);
router.delete('/:boardId', deleteBoard);

// Drag & Drop reorder
router.put('/:boardId/lists/reorder', reorderLists);
router.put('/:boardId/cards/reorder', reorderCards);

// List CRUD
router.post('/:boardId/lists', createList);
router.get('/:boardId/lists', getLists);
router.patch('/:boardId/lists/:listId', updateList);
router.delete('/:boardId/lists/:listId', deleteList);

// Card CRUD
router.post('/:boardId/lists/:listId/cards', createCard);
router.get('/:boardId/lists/:listId/cards', getCards);
router.get('/:boardId/cards/:cardId', getCardById);
router.patch('/:boardId/cards/:cardId', updateCard);
router.delete('/:boardId/cards/:cardId', deleteCard);

// Comments
router.post('/:boardId/cards/:cardId/comments', createComment);
router.get('/:boardId/cards/:cardId/comments', getComments);
router.patch('/:boardId/cards/:cardId/comments/:commentId', updateComment);
router.delete('/:boardId/cards/:cardId/comments/:commentId', deleteComment);

// Labels (board-level)
router.post('/:boardId/labels', createLabel);
router.get('/:boardId/labels', getLabels);
router.patch('/:boardId/labels/:labelId', updateLabel);
router.delete('/:boardId/labels/:labelId', deleteLabel);

// Label assignment (card-level)
router.post('/:boardId/cards/:cardId/labels', assignLabel);
router.delete('/:boardId/cards/:cardId/labels/:labelId', removeLabel);

// Checklists
router.post('/:boardId/cards/:cardId/checklists', createChecklist);
router.get('/:boardId/cards/:cardId/checklists', getChecklists);
router.delete('/:boardId/cards/:cardId/checklists/:checklistId', deleteChecklist);

// Checklist items
router.post('/:boardId/cards/:cardId/checklists/:checklistId/items', createChecklistItem);
router.patch('/:boardId/cards/:cardId/checklists/:checklistId/items/:itemId', updateChecklistItem);
router.delete('/:boardId/cards/:cardId/checklists/:checklistId/items/:itemId', deleteChecklistItem);

// Card members
router.post('/:boardId/cards/:cardId/members', assignCardMember);
router.get('/:boardId/cards/:cardId/members', getCardMembers);
router.delete('/:boardId/cards/:cardId/members/:memberId', removeCardMember);

// Activity log
router.get('/:boardId/cards/:cardId/activity', getActivityLog);

export default router;

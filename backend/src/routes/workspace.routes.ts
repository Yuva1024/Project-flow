import { Router } from 'express';
import { requireAuth } from '../middleware/auth.middleware';
import {
    createWorkspace,
    getWorkspaces,
    getWorkspaceById,
    inviteMember,
    updateMemberRole,
    removeMember,
    updateWorkspace,
    deleteWorkspace,
} from '../controllers/workspace.controller';

const router = Router();

// All workspace routes require authentication
router.use(requireAuth);

router.post('/', createWorkspace);
router.get('/', getWorkspaces);
router.get('/:id', getWorkspaceById);
router.patch('/:id', updateWorkspace);
router.delete('/:id', deleteWorkspace);

// Member management
router.post('/:id/invite', inviteMember);
router.patch('/:id/members/:memberId', updateMemberRole);
router.delete('/:id/members/:memberId', removeMember);

export default router;

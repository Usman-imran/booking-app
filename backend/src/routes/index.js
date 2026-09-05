import { Router } from 'express';
import healthRouter from './health.routes.js';
import authRouter from './auth.routes.js';
import customersRouter from './customers.routes.js';
import productsRouter from './products.routes.js';

const router = Router();

router.use('/health', healthRouter);
router.use('/auth', authRouter);
router.use('/customers', customersRouter);
router.use('/products', productsRouter);

// Further business domain routers (orders, ...) will be mounted here in
// later stages.

export default router;

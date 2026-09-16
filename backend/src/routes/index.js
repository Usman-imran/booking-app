import { Router } from 'express';
import healthRouter from './health.routes.js';
import authRouter from './auth.routes.js';
import customersRouter from './customers.routes.js';
import productsRouter from './products.routes.js';
import ordersRouter from './orders.routes.js';
import reportsRouter from './reports.routes.js';
import targetsRouter from './targets.routes.js';
import dashboardRouter from './dashboard.routes.js';
import companiesRouter from './companies.routes.js';

const router = Router();

router.use('/health', healthRouter);
router.use('/auth', authRouter);
router.use('/customers', customersRouter);
router.use('/products', productsRouter);
router.use('/orders', ordersRouter);
router.use('/reports', reportsRouter);
router.use('/targets', targetsRouter);
router.use('/dashboard', dashboardRouter);
router.use('/companies', companiesRouter);

export default router;

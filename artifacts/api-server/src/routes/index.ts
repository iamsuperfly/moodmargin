import { Router, type IRouter } from "express";
import healthRouter from "./health";
import marketsRouter from "./markets";
import riskRouter from "./risk";
import tradingRouter from "./trading";
import faucetRouter from "./faucet";
import walletRouter from "./wallet";
import leaderboardRouter from "./leaderboard";
import aiRouter from "./ai";
import adminRouter from "./admin";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/markets", marketsRouter);
router.use("/risk", riskRouter);
router.use("/trading", tradingRouter);
router.use("/faucet", faucetRouter);
router.use("/wallet", walletRouter);
router.use("/leaderboard", leaderboardRouter);
router.use("/ai", aiRouter);
router.use("/admin", adminRouter);

export default router;

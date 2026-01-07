import { PublicKey } from '@solana/web3.js';

// PumpFun Program
export const PUMP_FUN_PROGRAM = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');
export const GLOBAL_STATE = new PublicKey('4wTV1YmiEkRvAtNtsSGPtUrqRYQMe5SKy2uB4Jjaxnjf');
export const FEE_RECIPIENT = new PublicKey('CebN5WGQ4jvEPvsVU4EoHEpgzq1VV7AbicfhtW4xC9iM');
export const EVENT_AUTHORITY = new PublicKey('Ce6TQqeHC9p8KetsN6JsjHK7UTZk7nasjjnr7XxXp9F1');

// Solana Programs
export const SYSTEM_PROGRAM = new PublicKey('11111111111111111111111111111111');
export const TOKEN_PROGRAM = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
export const ASSOCIATED_TOKEN_PROGRAM = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');
export const RENT = new PublicKey('SysvarRent111111111111111111111111111111111');

// Instruction Discriminators (first 8 bytes of instruction data)
export const INSTRUCTION_DISCRIMINATORS = {
  CREATE: Buffer.from([0x14, 0x16, 0x56, 0x7b, 0xc6, 0x1c, 0xdb, 0x84]), // 1416567bc61cdb84
  BUY: Buffer.from([0x66, 0x06, 0x3d, 0x12, 0x01, 0xda, 0xeb, 0xea]),
  SELL: Buffer.from([0x33, 0xe6, 0x85, 0xa4, 0x01, 0x7f, 0x83, 0xad]),
};

// Bot defaults
export const DEFAULT_SLIPPAGE = 0.15; // 15%
export const PRICE_CHECK_INTERVAL = 2000; // 2 seconds
export const TX_CONFIRM_TIMEOUT = 60000; // 60 seconds
export const CONFIG_POLL_INTERVAL = 10000; // 10 seconds

// Lamports
export const LAMPORTS_PER_SOL = 1_000_000_000;

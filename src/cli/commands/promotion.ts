import { parseArgs } from 'node:util';
import { EXIT } from '../command.constants.js';
import type { Command, Io } from '../command.types.js';
import { withStore, withStoreAsync } from '../store.js';
import { EMPTY_SIZE } from '../../platform.constants.js';
import { s } from '../../schema/index.js';
import { PromotionController } from '../../promotion/promotion.controller.js';
import { listPromotionReceipts } from '../../promotion/promotion.receipts.js';

const PROMOTION_SUBCOMMAND = {
  LIST: 'list',
  RUN: 'run',
} as const;

const PROMOTION_OPTION = {
  CANDIDATE: 'candidate',
  REVIEW_RUN: 'review-run',
  TARGET: 'target',
} as const;

const STRING_OPTION = { type: 'string' } as const;

interface Subcommand {
  readonly usage: string;
  readonly run: (args: readonly string[], io: Io) => number | Promise<number>;
}

class UsageError extends Error {}

function requiredString(value: string | boolean | string[] | undefined, option: string): string {
  try {
    return s.nonEmptyString().parse(value);
  } catch {
    throw new UsageError(`missing --${option}`);
  }
}

async function runPromotion(args: readonly string[], io: Io): Promise<number> {
  const parsed = parseArgs({
    args,
    allowPositionals: true,
    options: {
      [PROMOTION_OPTION.CANDIDATE]: STRING_OPTION,
      [PROMOTION_OPTION.REVIEW_RUN]: STRING_OPTION,
      [PROMOTION_OPTION.TARGET]: STRING_OPTION,
    },
  });
  if (parsed.positionals.length !== EMPTY_SIZE) throw new UsageError('promotion run takes no positional arguments');
  const reviewCandidateId = requiredString(
    parsed.values[PROMOTION_OPTION.CANDIDATE],
    PROMOTION_OPTION.CANDIDATE,
  );
  const reviewerRunSpecId = requiredString(
    parsed.values[PROMOTION_OPTION.REVIEW_RUN],
    PROMOTION_OPTION.REVIEW_RUN,
  );
  return withStoreAsync(async (store, repoRoot) => {
    const targetRef = parsed.values[PROMOTION_OPTION.TARGET];
    const request = {
      reviewCandidateId,
      reviewerRunSpecId,
      ...(targetRef === undefined ? {} : { targetRef }),
    };
    const receipt = await new PromotionController(store, repoRoot).promote(request);
    io.out(JSON.stringify(receipt));
    return EXIT.OK;
  });
}

function listPromotions(args: readonly string[], io: Io): number {
  if (args.length !== EMPTY_SIZE) throw new UsageError('promotion list takes no arguments');
  return withStore((store) => {
    io.out(JSON.stringify(listPromotionReceipts(store)));
    return EXIT.OK;
  });
}

const SUBCOMMANDS: ReadonlyMap<string, Subcommand> = new Map([
  [PROMOTION_SUBCOMMAND.RUN, {
    usage: 'sv-playbook promotion run --candidate <ID> --review-run <RUN-ID> [--target <branch>]',
    run: runPromotion,
  }],
  [PROMOTION_SUBCOMMAND.LIST, {
    usage: 'sv-playbook promotion list',
    run: listPromotions,
  }],
]);

const USAGE = ['Usage:', ...Array.from(SUBCOMMANDS.values()).map(({ usage }) => `  ${usage}`)].join('\n');

export const command: Command = {
  name: 'promotion',
  summary: 'Verify, integrate, and close one immutable candidate through the runtime controller',
  destructive: true,
  async run(args, io) {
    const [subcommand, ...rest] = args;
    if (subcommand === undefined) {
      io.err(USAGE);
      return EXIT.USAGE;
    }
    const selected = SUBCOMMANDS.get(subcommand);
    if (selected === undefined) {
      io.err(USAGE);
      return EXIT.USAGE;
    }
    try {
      return await selected.run(rest, io);
    } catch (error: unknown) {
      if (error instanceof UsageError) {
        io.err(`${USAGE}\nerror: ${error.message}`);
        return EXIT.USAGE;
      }
      throw error;
    }
  },
};

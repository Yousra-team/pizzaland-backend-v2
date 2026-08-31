// validateMiddleware.ts
import { Request, Response, NextFunction } from 'express';
import { ZodTypeAny } from 'zod';

export const validateBody = (schema: ZodTypeAny) => {
    return (req: Request, res: Response, next: NextFunction) => {
        const result = schema.safeParse(req.body);

        if (!result.success) {
            return res.status(400).json({
                status: 'error',
                message: 'Validation failed',
                errors: result.error.errors.map(err => ({
                    field: err.path.join('.'),
                    message: err.message
                }))
            });
        }

        // Overwrite req.body with the sanitized/parsed data
        req.body = result.data;

        next();
    };
};

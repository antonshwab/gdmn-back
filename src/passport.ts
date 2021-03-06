import config from "config";
import jwt from "jsonwebtoken";
import {Middleware} from "koa";
import passport from "koa-passport";
import {ExtractJwt, Strategy as JWTStrategy} from "passport-jwt";
import {Strategy as LocalStrategy} from "passport-local";
import {IUserOutput} from "./apps/MainApplication";
import {ErrorCodes, throwCtx} from "./ErrorCodes";

const USERNAME_FIELD = "login";
const PASSWORD_FIELD = "password";

export function createAccessJwtToken(user: IUserOutput): string {
  return jwt.sign({
    id: user.id
  }, config.get("auth.jwtSecret"), {
    expiresIn: "3h"
  });
}

export function createRefreshJwtToken(user: IUserOutput): string {
  return jwt.sign({
    id: user.id,
    isRefresh: true
  }, config.get("auth.jwtSecret"), {
    expiresIn: "7d"
  });
}

export function getPayloadFromJwtToken(token: string): any {
  const verified = jwt.verify(token, config.get("auth.jwtSecret"));

  if (verified) {
    const payload = jwt.decode(token);
    if (!payload) {
      throw new Error("No payload");
    }

    return payload;
  }

  throw new Error("Token not valid");
}

passport.use(new LocalStrategy({
  usernameField: USERNAME_FIELD,
  passwordField: PASSWORD_FIELD,
  passReqToCallback: true,
  session: false
}, async (req: any, login, password, done) => {
  try {
    if (req.ctx.state.appManager) {
      const user = await req.ctx.state.appManager.mainApplication.checkUserPassword(login, password);
      if (user) {
        return done(null, user);
      }
      throwCtx(req.ctx, 401, "Invalid login or password", ErrorCodes.INVALID_ARGUMENTS,
        [USERNAME_FIELD, PASSWORD_FIELD]);
    }
    throwCtx(req.ctx, 500, "ApplicationManager is not provided", ErrorCodes.INTERNAL);
  } catch (error) {
    return done(error);
  }
}));

passport.use("jwt", new JWTStrategy({
    jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
    secretOrKey: config.get("auth.jwtSecret"),
    passReqToCallback: true
  },
  async (req: any, payload: any, done: any) => {
    try {
      if (req.ctx.state.appManager) {
        if (!payload.isRefresh) {
          const user = await req.ctx.state.appManager.mainApplication.findUser({id: payload.id});
          if (user) {
            return done(null, user);
          }
        }
        throwCtx(req.ctx, 401, "Invalid access token", ErrorCodes.INVALID_AUTH_TOKEN);
      }
      throwCtx(req.ctx, 500, "ApplicationManager is not provided", ErrorCodes.INTERNAL);
    } catch (error) {
      done(error);
    }
  }
));

passport.use("refresh_jwt", new JWTStrategy({
    jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
    secretOrKey: config.get("auth.jwtSecret"),
    passReqToCallback: true
  },
  async (req: any, payload: any, done: any) => {
    try {
      if (req.ctx.state.appManager) {
        if (payload.isRefresh) {
          const user = await req.ctx.state.appManager.mainApplication.findUser({id: payload.id});
          if (user) {
            return done(null, user);
          }
        }
        throwCtx(req.ctx, 401, "Invalid refresh token", ErrorCodes.INVALID_AUTH_TOKEN);
      }
      throwCtx(req.ctx, 500, "ApplicationManager is not provided", ErrorCodes.INTERNAL);
    } catch (error) {
      done(error);
    }
  }
));

passport.serializeUser((user, done) => {
  done(null, user);
});

passport.deserializeUser((user, done) => {
  done(null, user);
});

// type hack
class KoaPassport extends passport.KoaPassport {
}

export function getAuthMiddleware(strategyName: string, passportInstance: KoaPassport): Middleware {
  return async (ctx, next) => {
    await passportInstance.authenticate(strategyName, (error: Error, user: any, info: Error) => {
      if (info) {
        throwCtx(ctx, 401, info, ErrorCodes.INVALID_AUTH);
      }
      if (error) {
        throw error;
      }
      return ctx.login(user, {session: false});
    })(ctx, next);
    await next();
  };
}

export default passport;

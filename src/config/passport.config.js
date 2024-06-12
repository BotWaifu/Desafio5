import passport from "passport";
import local from "passport-local";
import jwt, { ExtractJwt } from "passport-jwt";
import GitHubStrategy from "passport-github2";
import { createHash, isValidPassword } from "../utils/functionsUtils.js";
import cartManager from "../dao/MongoDB/CartManagerDB.js";
import config from "./config.js";
import UserManager from "../dao/MongoDB/UserManagerDB.js";

const userService = new UserManager();

const initializePassport = () => {
  const localStrategy = local.Strategy;
  const JWTStrategy = jwt.Strategy;
  const CartService = new cartManager();

  const admin = {
    first_name: "Coder",
    last_name: "Admin",
    email: config.ADMIN_EMAIL,
    password: config.ADMIN_PASSWORD,
    role: "admin",
  };

  const CLIENT_ID = config.CLIENT_ID;
  const SECRET_ID = config.SECRET_ID;
  const githubCallbackURL = config.GITHUB_CALLBACK_URL;

  const cookieExtractor = (req) => {
    let token = null;
    if (req && req.cookies) {
      token = req.cookies.coderCookieToken ?? null;
    }
    return token;
  };

  passport.use(
    "register",
    new localStrategy(
      {
        passReqToCallback: true,
        usernameField: "email",
      },
      async (req, username, password, done) => {
        const { first_name, last_name, email, age, role } = req.body;

        try {
          let user = await userService.getUserByEmail(username);
          if (user) {
            return done(null, false, { message: "El usuario ya existe" });
          }

          const newUser = {
            first_name,
            last_name,
            email,
            age,
            cart: await CartService.createCart(),
            password: createHash(password),
            role: role || "user",
          };
          const result = await userService.createUser(newUser);

          return done(null, result);
        } catch (error) {
          return done(error);
        }
      }
    )
  );

  passport.use(
    "login",
    new localStrategy(
      {
        usernameField: "email",
      },
      async (username, password, done) => {
        try {
          if (username === config.ADMIN_EMAIL && password === config.ADMIN_PASSWORD) {
            const adminUser = admin;
            return done(null, adminUser);
          }

          const user = await userService.getUserByEmail(username);
          if (!user) {
            return done(null, false, { message: "Usuario no encontrado" });
          }

          if (!isValidPassword(user, password)) {
            return done(null, false, { message: "Contraseña incorrecta" });
          }

          if (!user.cart) {
            user.cart = await CartService.createCart();
            await userService.updateUser(user);
          }

          return done(null, user);
        } catch (error) {
          return done(error);
        }
      }
    )
  );

  passport.use(
    "github",
    new GitHubStrategy(
      {
        clientID: CLIENT_ID,
        clientSecret: SECRET_ID,
        callbackURL: githubCallbackURL,
      },
      async (accessToken, refreshToken, profile, done) => {
        try {
          const email = profile._json.email;

          let user = await userService.getUserByEmail(email);
          if (!user) {
            let newUser = {
              first_name: profile._json.login,
              last_name: " ",
              email: email || `${profile._json.login}@github.com`,
              password: "",
              age: 0,
              role: "user",
              cart: await CartService.createCart(),
            };
            let result = await userService.createUser(newUser);
            done(null, result);
          } else {
            if (!user.cart) {
              user.cart = await CartService.createCart();
              await userService.updateUser(user);
            }

            done(null, user);
          }
        } catch (error) {
          return done(error);
        }
      }
    )
  );

  passport.use(
    "jwt",
    new JWTStrategy(
      {
        jwtFromRequest: ExtractJwt.fromExtractors([cookieExtractor]),
        secretOrKey: config.JWT_SECRET,
      },
      async (jwt_payload, done) => {
        try {
          if (jwt_payload.email === admin.email) {
            const adminUser = admin;
            return done(null, adminUser);
          }
          return done(null, jwt_payload);
        } catch (error) {
          return done(error);
        }
      }
    )
  );

  passport.serializeUser((user, done) => {
    if (user.email === admin.email) {
      done(null, "admin");
    } else {
      done(null, user._id);
    }
  });

  passport.deserializeUser(async (id, done) => {
    if (id === "admin") {
      done(null, admin);
    } else {
      let user = await userService.getUserById(id);
      done(null, user);
    }
  });
};

export default initializePassport;

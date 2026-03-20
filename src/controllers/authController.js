import bcrypt from "bcrypt";
import createHttpError from "http-errors";
import jwt from 'jsonwebtoken';
import handlebars from 'handlebars';
import { readFile } from 'node:fs/promises';
import { User } from "../models/user.js";
import { Session } from "../models/session.js";
import { createSession, setSessionCookies } from '../services/auth.js';
import { sendEmail } from '../utils/sendMail.js';

let resetPasswordEmailTemplate = null;
const getResetPasswordEmailTemplate = async () => {
  if (resetPasswordEmailTemplate) return resetPasswordEmailTemplate;

  const templateSource = await readFile(
    new URL('../templates/reset-password-email.html', import.meta.url),
    'utf-8',
  );

  resetPasswordEmailTemplate = handlebars.compile(templateSource);
  return resetPasswordEmailTemplate;
};

//register user controller

export const registerUser = async (req, res) => {
  const { email, password } = req.body;

  const existingUser = await User.findOne({ email });
  if (existingUser) {
    throw createHttpError(400, 'Email in use');
  }

  // Хешуємо пароль
  const hashedPassword = await bcrypt.hash(password, 10);

  // Створюємо користувача
  const user = await User.create({
    email,
    password: hashedPassword,
  });

  const newSession = await createSession(user._id);
  setSessionCookies(res, newSession);

  // Відправляємо дані користувача (без пароля) у відповіді
  res.status(201).json(user);
};


//login user controller

export const loginUser = async (req, res) => {
  const { email, password } = req.body;

	// Перевіряємо чи користувач з такою поштою існує
  const user = await User.findOne({ email });
  if (!user) {
    throw createHttpError(401, 'Invalid credentials');
  }

	// Порівнюємо хеші паролів
  const isValidPassword = await bcrypt.compare(password, user.password);
  if (!isValidPassword) {
    throw createHttpError(401, 'Invalid credentials');
  }

  await Session.deleteOne({ userId: user._id });

  const newSession = await createSession(user._id);

  // 3. Викликаємо, передаємо об'єкт відповіді та сесію
  setSessionCookies(res, newSession);

  res.status(200).json(user);
};

//logout user controller

export const logoutUser = async (req, res) => {
  const { sessionId } = req.cookies;

  if (sessionId) {
    await Session.deleteOne({ _id: sessionId });
  }

  const cookieOptions = { httpOnly: true, secure: true, sameSite: 'none' };
  res.clearCookie('sessionId', cookieOptions);
  res.clearCookie('accessToken', cookieOptions);
  res.clearCookie('refreshToken', cookieOptions);

  res.status(204).send();
};


export const refreshUserSession = async (req, res) => {
  // 1. Знаходимо поточну сесію за id сесії та рефреш токеном
  const session = await Session.findOne({
    _id: req.cookies.sessionId,
    refreshToken: req.cookies.refreshToken,
  });

  // 2. Якщо такої сесії нема, повертаємо помилку
  if (!session) {
    throw createHttpError(401, 'Session not found');
  }

  // 3. Якщо сесія існує, перевіряємо валідність рефреш токена
  const isSessionTokenExpired =
    new Date() > new Date(session.refreshTokenValidUntil);

  // Якщо термін дії рефреш токена вийшов, повертаємо помилку
  if (isSessionTokenExpired) {
    throw createHttpError(401, 'Session token expired');
  }

  // 4. Якщо всі перевірки пройшли добре, видаляємо поточну сесію
  await Session.deleteOne({
    _id: req.cookies.sessionId,
    refreshToken: req.cookies.refreshToken,
  });

  // 5. Створюємо нову сесію та додаємо кукі
  const newSession = await createSession(session.userId);
  setSessionCookies(res, newSession);

  res.status(200).json({
    message: 'Session refreshed',
  });
};

export const requestResetEmail = async (req, res) => {
  const { email } = req.body;

  const user = await User.findOne({ email });
  if (!user) {
    return res.status(200).json({
      message: 'Password reset email sent successfully',
    });
  }

  const jwtSecret = process.env.JWT_SECRET;
  const frontendDomain = process.env.FRONTEND_DOMAIN;

  if (!jwtSecret || !frontendDomain) {
    throw createHttpError(500, 'Server misconfiguration');
  }

  const token = jwt.sign({ email: user.email }, jwtSecret, {
    subject: user._id.toString(),
    expiresIn: '15m',
  });

  const resetPasswordLink = `${frontendDomain.replace(/\/$/, '')}/reset-password?token=${encodeURIComponent(token)}`;

  const template = await getResetPasswordEmailTemplate();
  const html = template({
    name: user.username || user.email,
    link: resetPasswordLink,
  });

  try {
    await sendEmail({
      to: user.email,
      subject: 'Password reset',
      html,
    });
  } catch (err) {
    throw createHttpError(
      500,
      'Failed to send the email, please try again later.',
    );
  }

  res.status(200).json({
    message: 'Password reset email sent successfully',
  });
};

export const resetPassword = async (req, res) => {
  const { token, password } = req.body;

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    throw createHttpError(401, 'Invalid or expired token');
  }

  if (!payload?.sub || !payload?.email) {
    throw createHttpError(401, 'Invalid or expired token');
  }

  const user = await User.findOne({ _id: payload.sub, email: payload.email });
  if (!user) {
    throw createHttpError(404, 'User not found');
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  user.password = hashedPassword;
  await user.save();

  res.status(200).json({
    message: 'Password reset successfully',
  });
};

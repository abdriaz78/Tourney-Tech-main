// src\utils\server\tokens.js

import jwt from "jsonwebtoken";
import { cookies } from "next/headers";

const ACCESS_SECRET = process.env.ACCESS_TOKEN_SECRET;
const REFRESH_SECRET = process.env.REFRESH_TOKEN_SECRET;

const ACCESS_EXPIRES_IN = process.env.ACCESS_TOKEN_EXPIRY || "15m";
const REFRESH_EXPIRES_IN = process.env.REFRESH_TOKEN_EXPIRY || "7d";

/**
 * Generate a JWT access token for the user
 *
 * @param {string} user
 */
export function generateAccessToken(user) {
  return jwt.sign(
    {
      _id: user._id,
      email: user.email,
      username: user.username,
    },
    ACCESS_SECRET,
    { expiresIn: ACCESS_EXPIRES_IN }
  );
}

/**
 * Generate a JWT refresh token for the user
 *
 * @param {string} user
 */
export function generateRefreshToken(user) {
  return jwt.sign({ _id: user._id }, REFRESH_SECRET, {
    expiresIn: REFRESH_EXPIRES_IN,
  });
}

/**
 * Verify a JWT access token
 *
 * @param {string} token
 */
export function verifyAccessToken(token) {
  try {
    return jwt.verify(token, ACCESS_SECRET);
  } catch (err) {
    console.log("Access Token Varification Error ", err);
    return null;
  }
}

/**
 * Verify a JWT refresh token
 *
 * @param {string} token
 */
export function verifyRefreshToken(token) {
  try {
    return jwt.verify(token, REFRESH_SECRET);
  } catch (err) {
    console.log("Refresh Token Verification Error", err);
    return null;
  }
}

/**
 * Helper function to convert time string to seconds
 * Examples: "15m" -> 900, "7d" -> 604800
 */
function timeToSeconds(timeString) {
  const unit = timeString.slice(-1);
  const value = parseInt(timeString.slice(0, -1));

  switch (unit) {
    case 's': return value;
    case 'm': return value * 60;
    case 'h': return value * 60 * 60;
    case 'd': return value * 60 * 60 * 24;
    default: return value;
  }
}

/**
 * Sets access and refresh tokens as secure HTTP-only cookies
 *
 * @param {string} accessToken
 * @param {string} refreshToken
 */
export function setAuthCookies(response, accessToken, refreshToken) {
  const isProduction = process.env.NODE_ENV === "production";

  // In development, be more permissive with cookies
  const sameSiteValue = isProduction ? "strict" : "lax";
  const secureValue = isProduction;

  console.log("Setting cookies in", isProduction ? "production" : "development", "mode");

  // Set access token cookie
  response.cookies.set("accessToken", accessToken, {
    httpOnly: true,
    secure: secureValue,
    sameSite: sameSiteValue,
    maxAge: timeToSeconds(ACCESS_EXPIRES_IN),
    path: "/",
  });

  // Set refresh token cookie
  response.cookies.set("refreshToken", refreshToken, {
    httpOnly: true,
    secure: secureValue,
    sameSite: sameSiteValue,
    maxAge: timeToSeconds(REFRESH_EXPIRES_IN),
    path: "/",
  });

  console.log("Cookies set successfully");

  return response;
}

/**
 * Clears access and refresh tokens as secure HTTP-only cookies
 *
 * @param {string} accessToken
 * @param {string} refreshToken
 */
export async function clearAuthCookies() {
  const cookieStore = await cookies();

  cookieStore.delete("accessToken");
  cookieStore.delete("refreshToken");
}

/*
Example usage after login/register


import { generateAccessToken, generateRefreshToken } from "@/utils/server/tokens";

const accessToken = generateAccessToken(user);
const refreshToken = generateRefreshToken(user);
*/

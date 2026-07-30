# TrendingNow API Documentation

This document describes all backend API endpoints for the TrendingNow app, compiled from the provided Postman collections: **User**, **Genre**, **Feed**, **Favourite Creators**, **Creator**, and **Comments**.

---

## General Conventions

### Base URL
All requests use a `{{baseurl}}` Postman variable — set this to your environment's API host (e.g. `http://localhost:3000`).

### Common Headers
Almost every request sends these headers:

| Header | Example Value | Notes |
|---|---|---|
| `Content-Type` | `application/json` | Required on any request with a JSON body |
| `x-app-version` | `1.0.7` | App version making the request |
| `x-platform` | `android`/`ios`  | Client platform |

### Authentication
Some endpoints require a **Bearer token** (JWT), passed via the `Authorization: Bearer <token>` header. The JWT payload includes `userId`, `firebaseUid` claims — meaning tokens are user-specific and expire.

Endpoints requiring auth (per the collections):
- `Get user by Uid`
- `Add / Remove / Get Favorite Creators`
- `Post Comment`
- `Delete Comment`

Endpoints **not** marked with auth in the collections (Register/Login, Update/Delete User, all Genre endpoints, Feed, Creator, Get Comments) may still require auth in practice — the Postman files simply don't show a token attached, so double check against server middleware if unsure.

---

## 1. User API

Base path: `/api/user`

### 1.1 Register / Login User
- **Method:** `POST`
- **URL:** `{{baseurl}}/api/user`
- **Auth:** None shown
- **Body (JSON):**
```json
{
    "firebaseUid": "firebase_uid_123",
    "email": "user@example.com"
}
```
> Note: In the sample request, `username`, `firstName`, and `lastName` are commented out — suggesting these are optional on first registration/login and may be filled in later via Update.

- **Purpose:** Registers a new user or logs in an existing one, keyed by `firebaseUid` (Firebase Authentication UID).

### 1.2 Refresh Token
- **Method:** `POST`
- **URL:** `{{baseurl}}/api/user`
- **Auth:** None shown
- **Body (JSON):**
```json
{
    "firebaseUid": "firebase_uid_1234",
    "username": "user_dev",
    "firstName": "user",
    "lastName": "DEV",
    "email": "user@example.com"
}
```
- **Purpose:** Uses the same `/api/user` POST endpoint as registration/login, but supplies the full profile — likely the server upserts the user and returns a fresh JWT. (Note: this shares the exact route as "Register/Login User"; the distinction appears to be in usage/intent rather than a separate route.)

### 1.3 Get User by Uid
- **Method:** `GET`
- **URL:** `{{baseurl}}/api/user`
- **Auth:** Bearer token required
- **Purpose:** Returns the authenticated user's profile. The user is identified via the JWT (`userId`/`firebaseUid` claims) rather than a URL parameter.

### 1.4 Update User
- **Method:** `PATCH`
- **URL:** `{{baseurl}}/api/user/{{uid}}`
- **Body (JSON):**
```json
{
    "firstName": "Updated",
    "lastName": "Name",
    "profileImage": "https://example.com/new-image.jpg",
}
```
- **Path Variable:** `uid` — the user's ID.
- **Purpose:** Partially updates a user's profile fields (name, location, bio, profile image, etc.).

---

## 2. Genre API

Base path: `/api/genre`

### 2.1 Add Genre
- **Method:** `POST`
- **URL:** `{{baseurl}}/api/genre`
- **Body (JSON):**
```json
{
  "genreName": "Comedy",
  "genreColor": "#FFD700",
  "genreImage": "https://example.com/comedy.png"
}
```
- **Purpose:** Creates a new genre with a name, display color, and image.

### 2.2 All Genres
- **Method:** `GET`
- **URL:** `{{baseurl}}/api/genre`
- **Purpose:** Retrieves the full list of genres.

### 2.3 Update Genre
- **Method:** `PUT`
- **URL:** `{{baseurl}}/api/genre/:id` (example shows `http://localhost:3000/api/genre/:id`)
- **Path Variable:** `id` — genre ID (e.g. `6a688953e358b25154662973`)
- **Body (JSON):**
```json
{
  "genreName": "Entertainment",
  "genreColor": "#FF5733",
  "genreImage": "https://example.com/new-image.png"
}
```
- **Purpose:** Fully replaces a genre's name, color, and image.

### 2.4 Delete Genre
- **Method:** `DELETE`
- **URL:** `{{baseurl}}/api/genre/:id`
- **Path Variable:** `id` — genre ID (e.g. `6a687c77ab2c1d0a7896470e`)
- **Purpose:** Deletes a genre.

### 2.5 Add Creators to Genre
- **Method:** `PATCH`
- **URL:** `{{baseurl}}/api/genre/:id/creators/`
- **Path Variable:** `id` — genre ID (e.g. `6a68847d0b3dee89193a42c3`)
- **Body (JSON):**
```json
{
    "creatorIds": [
        "6a2bdea3ace0895f11f3957d",
        "6a2bdea3ace0895f11f3957e",
        "6a2bdea4ace0895f11f3957f"
    ]
}
```
- **Purpose:** Associates one or more creators with a genre (bulk add via array of `creatorIds`).

### 2.6 Remove Creators to Genre
- **Method:** `DELETE`
- **URL:** `{{baseurl}}/api/genre/:id/creators/:creator`
- **Path Variables:**
  - `id` — genre ID (e.g. `6a68847d0b3dee89193a42c3`)
  - `creator` — creator ID to remove (e.g. `6a2bdea3ace0895f11f3957d`)
- **Purpose:** Removes a single creator from a genre (one at a time, unlike the bulk add).

---

## 3. Feed API

Base path: `/api/feed`

### 3.1 Homepage Feed
- **Method:** `GET`
- **URL:** `{{baseurl}}/api/feed/homepage`
- **Purpose:** Returns the main homepage feed content (likely an aggregated/curated list of posts, creators, or trending items — exact response shape not present in the collection).

---

## 4. Favourite Creators API

Base path: `/api/user/favorite-creators`

All endpoints in this collection require a **Bearer token**.

### 4.1 Add Favorite Creators
- **Method:** `POST`
- **URL:** `{{baseurl}}/api/user/favorite-creators`
- **Auth:** Bearer token required
- **Body (JSON):**
```json
{
    "creatorId": "6a2f9f76ace0895f11f4e5dc"
}
```
- **Purpose:** Adds a single creator to the authenticated user's list of favorite creators.

### 4.2 Remove Favorite Creators
- **Method:** `DELETE`
- **URL:** `{{baseurl}}/api/user/favorite-creators`
- **Auth:** Bearer token required
- **Body (JSON):**
```json
{
    "creatorId": "6a2bdea4ace0895f11f3957f"
}
```
- **Purpose:** Removes a creator from the authenticated user's favorites. Note the `creatorId` is passed in the DELETE request body (not a URL param).

### 4.3 Get Favorite Creators
- **Method:** `GET`
- **URL:** `{{baseurl}}/api/user/favorite-creators`
- **Auth:** Bearer token required
- **Purpose:** Retrieves the authenticated user's list of favorite creators.

---

## 5. Creator API

### 5.1 Creator Page Feed
- **Method:** `GET`
- **URL:** `{{baseurl}}/api/creator/:creator`
- **Path Variable:** `creator` — creator's identifier/handle (example: `Samay_Raina`)
- **Purpose:** Returns the feed/profile content for a specific creator's page. The path variable appears to accept a human-readable handle rather than a database ID.

### 5.2 Creator Rank
- **Method:** `GET`
- **URL:** `{{baseurl}}/api/rank/`
- **Purpose:** Returns creator rankings (e.g. a leaderboard of creators, likely by popularity/engagement — exact ranking criteria not specified in the collection).

---

## 6. Comments API

Base path: `/api/user/comment`

### 6.1 Get Comments
- **Method:** `GET`
- **URL:** `{{baseurl}}/api/user/comment/3887459313203902767_58394357368`
- **Auth:** None shown
- **Purpose:** Retrieves comments for a given post, identified by a composite `postId` in the URL path (format: `<value>_<value>`, likely `<mediaId>_<userId>` per Instagram's post ID convention — see body of "Post Comment" below).

### 6.2 Post Comment
- **Method:** `POST`
- **URL:** `{{baseurl}}/api/user/comment`
- **Auth:** Bearer token required
- **Body (JSON):**
```json
{
    "source": "instagram",
    "headline": "Samay Raina breaks another record",
    "topic": "Entertainment",
    "postId": "3887459313203902767_58394357368",
    "comment": "Amazing post 🔥"
}
```
- **Purpose:** Posts a new comment on content sourced from a platform (e.g. Instagram). Includes contextual metadata (`source`, `headline`, `topic`) alongside the `postId` and `comment` text — likely used to create/reference the underlying post record if it doesn't already exist.

### 6.3 Delete Comment
- **Method:** `DELETE`
- **URL:** `{{baseurl}}/api/user/comment`
- **Auth:** Bearer token required
- **Body (JSON):**
```json
{
    "postId": "3887459313203902767_58394357368",
    "commentId": "6a4cbf596f60a3b025bca7f6"
}
```
- **Purpose:** Deletes a specific comment (`commentId`) from a specific post (`postId`). Both identifiers are passed in the DELETE body.

---

## Appendix: Full Endpoint Summary Table

| Collection | Name | Method | Path | Auth |
|---|---|---|---|---|
| User | Register / Login User | POST | `/api/user` | No |
| User | Refresh Token | POST | `/api/user` | No |
| User | Get user by Uid | GET | `/api/user` | Yes |
| User | Update user | PATCH | `/api/user/:uid` | No shown |
| User | Delete User | DELETE | `/api/user/:uid` | No shown |
| Genre | Add Genre | POST | `/api/genre` | No |
| Genre | All Genres | GET | `/api/genre` | No |
| Genre | Update Genre | PUT | `/api/genre/:id` | No |
| Genre | Delete Genre | DELETE | `/api/genre/:id` | No |
| Genre | Add Creators to Genre | PATCH | `/api/genre/:id/creators/` | No |
| Genre | Remove Creators to Genre | DELETE | `/api/genre/:id/creators/:creator` | No |
| Feed | Homepage Feed | GET | `/api/feed/homepage` | No |
| Favourite Creators | Add Favorite Creators | POST | `/api/user/favorite-creators` | Yes |
| Favourite Creators | Remove Favorite Creators | DELETE | `/api/user/favorite-creators` | Yes |
| Favourite Creators | Get Favorite Creators | GET | `/api/user/favorite-creators` | Yes |
| Creator | Creator page Feed | GET | `/api/creator/:creator` | No |
| Creator | Creator Rank | GET | `/api/rank/` | No |
| Comments | Get Comments | GET | `/api/user/comment/:postId` | No |
| Comments | Post Comment | POST | `/api/user/comment` | Yes |
| Comments | Delete Comment | DELETE | `/api/user/comment` | Yes |

---

## Notes for App Developers

1. **Composite IDs**: The Comments API's `postId` uses an underscore-delimited composite format (`<mediaId>_<userId>`), consistent with Instagram's post ID scheme — pass this exact format from the client.
2. **DELETE with body**: Several DELETE endpoints (`Favourite Creators`, `Comments`) expect a JSON body rather than URL/query params — make sure your HTTP client supports sending a body on DELETE requests.
3. **Bulk vs. single operations**: Genre-to-creator association supports bulk add (`creatorIds` array) but only single removal (one `creator` path param at a time).
4. **Token expiry**: JWTs contain `iat`/`exp` claims — clients should handle 401s by re-authenticating (see Register/Login and Refresh Token endpoints).
5. **Versioning header**: `x-app-version` differs across collections (`1.0.3` vs `1.0.7`) — ensure your client sends the correct current version to avoid any server-side version-gating logic.

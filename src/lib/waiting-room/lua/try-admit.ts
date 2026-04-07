// Atomic check-and-admit with FIFO queue ordering.
//
// KEYS[1] = wr:{ns}:active    (Hash: userId -> expiryUnixMs)
// KEYS[2] = wr:{ns}:queue     (Sorted Set: score=joinTimestampMs, member=userId)
// KEYS[3] = wr:{ns}:durations (List: recent session durations in ms for rolling avg)
//
// ARGV[1] = capacity      (max concurrent users)
// ARGV[2] = userId
// ARGV[3] = nowMs         (current unix timestamp in milliseconds)
// ARGV[4] = sessionTtlMs  (session TTL in milliseconds)
// ARGV[5] = queueTtlMs    (queue entry TTL in milliseconds)
//
// Returns: {status, position}
//   status=1 -> admitted, position=-1
//   status=2 -> queued,   position=N (1-indexed)
//   status=3 -> already_active, position=-1
export const TRY_ADMIT_LUA = `
local activeKey    = KEYS[1]
local queueKey     = KEYS[2]
local durationsKey = KEYS[3]
local capacity     = tonumber(ARGV[1])
local userId       = ARGV[2]
local nowMs        = tonumber(ARGV[3])
local sessionTtlMs = tonumber(ARGV[4])
local queueTtlMs   = tonumber(ARGV[5])

local allActive = redis.call('HGETALL', activeKey)
for i = 1, #allActive, 2 do
  local uid    = allActive[i]
  local expiry = tonumber(allActive[i + 1])
  if expiry and expiry <= nowMs then
    local joinTime = redis.call('ZSCORE', queueKey, uid)
    if not joinTime then
      redis.call('RPUSH', durationsKey, tostring(sessionTtlMs))
    end
    redis.call('HDEL', activeKey, uid)
  end
end

local staleThreshold = nowMs - queueTtlMs
redis.call('ZREMRANGEBYSCORE', queueKey, '-inf', tostring(staleThreshold))

local existingExpiry = redis.call('HGET', activeKey, userId)
if existingExpiry and tonumber(existingExpiry) > nowMs then
  return {3, -1}
end

local activeCount = redis.call('HLEN', activeKey)

if activeCount < capacity then
  local front = redis.call('ZRANGE', queueKey, 0, 0)
  local queueSize = redis.call('ZCARD', queueKey)

  if queueSize == 0 or (front[1] and front[1] == userId) then
    local expiryMs = nowMs + sessionTtlMs
    redis.call('HSET', activeKey, userId, tostring(expiryMs))
    redis.call('ZREM', queueKey, userId)
    redis.call('LTRIM', durationsKey, -100, -1)
    return {1, -1}
  end
end

redis.call('ZADD', queueKey, 'NX', tostring(nowMs), userId)

local position = redis.call('ZRANK', queueKey, userId)
if position == false then
  position = 0
end

return {2, position + 1}
`;

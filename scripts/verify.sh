#!/usr/bin/env bash
# Post-deploy health check for floxcy.com + api.floxcy.com.
#
# Usage:
#   ./scripts/verify.sh                # run all checks
#   ./scripts/verify.sh --quick        # skip the longer DLD samples
#   ./scripts/verify.sh --api-only     # backend only
#   ./scripts/verify.sh --frontend-only
#
# Exits 0 if all checks pass, 1 otherwise. Designed to be quick (~5s) and
# safe to run repeatedly while a deploy is rolling out.

set -uo pipefail

API="https://api.floxcy.com"
SITE="https://floxcy.com"
MAX_TIME=8

# Flags
QUICK=0
API_ONLY=0
FRONTEND_ONLY=0
for arg in "$@"; do
  case "$arg" in
    --quick) QUICK=1 ;;
    --api-only) API_ONLY=1 ;;
    --frontend-only) FRONTEND_ONLY=1 ;;
    -h|--help)
      sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *) echo "Unknown flag: $arg" >&2; exit 2 ;;
  esac
done

# Colours — fall back to plain if not a TTY
if [ -t 1 ]; then
  G="\033[32m"; R="\033[31m"; Y="\033[33m"; D="\033[2m"; N="\033[0m"
else
  G=""; R=""; Y=""; D=""; N=""
fi

pass=0
fail=0
declare -a failures=()

# --------------------------------------------------------------------------
# check NAME URL [grep-substring]
#   - Curls URL with a max-time + Content-Type/Accept JSON header
#   - PASS if HTTP 200 AND (no substring OR substring found in body)
# --------------------------------------------------------------------------
check() {
  local name="$1" url="$2" needle="${3:-}"
  local body status ttfb
  local tmp; tmp=$(mktemp)
  # Single curl call gives us body, status, and timing
  status=$(curl -s -o "$tmp" -w "%{http_code} %{time_starttransfer}" --max-time "$MAX_TIME" "$url" 2>/dev/null || echo "000 0")
  ttfb=$(echo "$status" | awk '{print $2}')
  status=$(echo "$status" | awk '{print $1}')
  body=$(cat "$tmp"); rm -f "$tmp"

  local ok=0
  if [ "$status" = "200" ]; then
    if [ -z "$needle" ] || echo "$body" | grep -q -- "$needle"; then
      ok=1
    fi
  fi

  if [ $ok -eq 1 ]; then
    printf "  ${G}✓${N} %-48s ${D}HTTP %s · ttfb %.2fs${N}\n" "$name" "$status" "$ttfb"
    pass=$((pass + 1))
  else
    printf "  ${R}✗${N} %-48s ${D}HTTP %s · ttfb %.2fs${N}" "$name" "$status" "$ttfb"
    [ -n "$needle" ] && printf " ${R}(missing: %s)${N}" "$needle"
    printf "\n"
    failures+=("$name [$url]")
    fail=$((fail + 1))
  fi
}

post_check() {
  local name="$1" url="$2" body="$3" needle="${4:-}"
  local resp status
  local tmp; tmp=$(mktemp)
  status=$(curl -s -o "$tmp" -w "%{http_code}" --max-time "$MAX_TIME" \
    -X POST -H "Content-Type: application/json" \
    -d "$body" "$url" 2>/dev/null || echo "000")
  resp=$(cat "$tmp"); rm -f "$tmp"

  if [ "$status" = "200" ] && { [ -z "$needle" ] || echo "$resp" | grep -q -- "$needle"; }; then
    printf "  ${G}✓${N} %-48s ${D}HTTP %s${N}\n" "$name" "$status"
    pass=$((pass + 1))
  else
    printf "  ${R}✗${N} %-48s ${D}HTTP %s${N}\n" "$name" "$status"
    failures+=("$name [POST $url]")
    fail=$((fail + 1))
  fi
}

started=$(date -u +%H:%M:%S)
echo "Floxcy health check  ·  $started UTC"
echo ""

# ============================================================================
# Backend
# ============================================================================
if [ $FRONTEND_ONLY -eq 0 ]; then
  echo "Backend  ${D}($API)${N}"
  check "/ root"                       "$API/"                                   '"service"'
  check "/health"                      "$API/health"                             '"status"'
  check "/api/v1/areas/stats"          "$API/api/v1/areas/stats"                 'total_count'
  check "/api/v1/areas/all"            "$API/api/v1/areas/all?sort_by=name"      'coverage_tier'
  check "/api/v1/areas/coverage-stats" "$API/api/v1/areas/coverage-stats"        'by_tier'
  check "/api/v1/dld/areas/stats"      "$API/api/v1/dld/areas/stats"             'total_areas'
  check "/api/v1/dld/companies/top"    "$API/api/v1/dld/companies/top?limit=1"   'active_broker_count'

  if [ $QUICK -eq 0 ]; then
    check "/dld/areas/business+bay/top-buildings (empty-state)" \
                                       "$API/api/v1/dld/areas/business%20bay/top-buildings?k=3" \
                                       '"area_name":"Business Bay"'
    check "/dld/areas/damac+hills+2/top-buildings (alias)" \
                                       "$API/api/v1/dld/areas/damac%20hills%202/top-buildings?k=3" \
                                       '"count"'
    post_check "/dld/rent-check (1BR Business Bay 85k)" \
                                       "$API/api/v1/dld/rent-check" \
                                       '{"area_name":"business bay","size_category":"1br","annual_rent":85000,"prop_sub_type":"Flat"}' \
                                       '"verdict"'
    post_check "/dld/rent-check defensive 422 (no size)" \
                                       "$API/api/v1/dld/rent-check" \
                                       '{"area_name":"business bay","annual_rent":85000}' \
                                       ''
  fi
  echo ""
fi

# ============================================================================
# Frontend
# ============================================================================
if [ $API_ONLY -eq 0 ]; then
  echo "Frontend  ${D}($SITE)${N}"
  check "/ homepage"                   "$SITE/"                       '362'
  check "/areas"                       "$SITE/areas"                  'All Dubai Areas'
  check "/buildings"                   "$SITE/buildings"              'Building X-Ray'
  check "/brokers/directory"           "$SITE/brokers/directory"      'RERA'
  check "/rent-check"                  "$SITE/rent-check"             'Pick your area'
  check "/opportunities"               "$SITE/opportunities"          'Opportunities'
  check "/compare"                     "$SITE/compare"                'Compare'
  check "/advisor"                     "$SITE/advisor"                'Analyst'
  check "/dashboard"                   "$SITE/dashboard"              ''
  echo ""
fi

# ============================================================================
# Summary
# ============================================================================
total=$((pass + fail))
if [ $fail -eq 0 ]; then
  printf "${G}✓ all %d checks passed${N}\n" "$total"
  exit 0
else
  printf "${R}✗ %d/%d checks failed${N}\n" "$fail" "$total"
  for f in "${failures[@]}"; do
    printf "  ${R}-${N} %s\n" "$f"
  done
  exit 1
fi

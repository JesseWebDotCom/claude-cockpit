"""Deterministic, offline tests for lane-health. Run: python3 -m unittest discover -s <this dir>"""
import importlib.machinery, importlib.util, json, os, stat, tempfile, unittest, subprocess

HERE = os.path.dirname(os.path.abspath(__file__))
SCRIPT = os.path.join(os.path.dirname(HERE), "lane-health")
loader = importlib.machinery.SourceFileLoader("lane_health", SCRIPT)
spec = importlib.util.spec_from_loader("lane_health", loader)
lh = importlib.util.module_from_spec(spec)
loader.exec_module(lh)

IDLE = "\n  Worked for 34s\n\n› Ask Codex to do anything\n\n  GPT-6-Luna low\n"
BUSY = "doing things\n• Working (3m 12s • esc to interrupt)\n› \n"
BUSY2 = "doing things\n• Working (4m 40s • esc to interrupt)\n› \n"
ASK = "Run this command?\n  1. Yes, proceed (y)\n  2. No\n"
CREDITS = "You have hit your usage limit. Try again at 3:40 PM.\n› \n"
T0 = "2026-10-13T12:00:00Z"


class Rig:
    def __init__(self, tc, plan_steps, claims=None, locks=None, panes=None):
        self.tc = tc
        self.d = tempfile.mkdtemp()
        tc.addCleanup(lambda: __import__("shutil").rmtree(self.d, ignore_errors=True))
        for sub in ("claims", "lane-locks", "codex-reports", "bin", "fakeprojects", "lane-health"):
            os.makedirs(os.path.join(self.d, sub))
        self.panes = panes or {}
        self.set_plan(plan_steps)
        for k, v in (claims or {}).items():
            self.write("claims/%s.claim" % k, v)
        for k, v in (locks or {}).items():
            self.write("lane-locks/%s.lock" % k, v)
        self.write("status.json", "{}")
        self.notes = []
        self.plan_set_log = os.path.join(self.d, "plan-set.log")
        self.real_plan = False
        plan_tool = os.path.abspath(os.path.join(HERE, "..", "..", "tools", "plan-set"))
        self.status_tool = os.path.abspath(os.path.join(HERE, "..", "..", "tools", "status-set"))
        self.fake("bin/plan-set", '#!/bin/sh\necho "$@" >> %s\nif [ "$LH_REAL_PLAN_SET" = 1 ]; then exec python3 %s "$@"; fi\nexit 0\n' % (self.plan_set_log, plan_tool))
        self.fake("bin/plan-page-build", '#!/bin/sh\necho built >> %s.build\nexit 0\n' % self.plan_set_log)
        self.fake("bin/notify", '#!/bin/sh\necho "$@" >> %s/notes.log\n' % self.d)
        self.fake("bin/claude", '#!/bin/sh\necho "[]"\n')
        self.hook = {"claude_scan": lambda now: {"checkedAt": lh.iso(now), "waiting": [], "hung": [],
                                                  "finishedSubagents": [], "live": [], "recentActivityAt": None},
                     "port_open": lambda p: True, "pid_alive": lambda p: True,
                     "fingerprint": lambda p: "fp1", "repo_of": lambda p: None, "unpushed": lambda r: 0}

    def write(self, rel, text):
        with open(os.path.join(self.d, rel), "w") as f:
            f.write(text)

    def fake(self, rel, text):
        self.write(rel, text)
        os.chmod(os.path.join(self.d, rel), 0o755)

    def set_plan(self, steps):
        self.write("plan.json", json.dumps({"plan": "p", "milestones": [{"id": "m", "title": "m", "steps": steps}]}))

    def run(self, now, sessions=None, panes=None, extra_env=None):
        if panes is not None:
            self.panes = panes
        sess = sessions if sessions is not None else list(self.panes)
        # fake tmux: reads pane files
        tdir = os.path.join(self.d, "tmuxfix")
        os.makedirs(tdir, exist_ok=True)
        for n, t in self.panes.items():
            open(os.path.join(tdir, n), "w").write(t)
        self.fake("bin/tmux", """#!/bin/sh
case "$1" in
 list-sessions) for s in %s; do echo $s; done;;
 capture-pane) cat %s/"$4";;
 send-keys) echo "$@" >> %s/sendkeys.log;;
esac
""" % (" ".join(sess), tdir, self.d))
        env = {"LH_STATUS_SET": self.status_tool, "LH_REAL_PLAN_SET": "1" if self.real_plan else "0", "LH_TMUX": os.path.join(self.d, "bin/tmux"), "LH_NOW": now,
               "LH_NOTIFY": os.path.join(self.d, "bin/notify"), "LH_PLAN_SET": os.path.join(self.d, "bin/plan-set"),
               "LH_PLAN_PAGE_BUILD": os.path.join(self.d, "bin/plan-page-build"),
               "LH_GATE_DIR": os.path.join(self.d, "nogate"), "LH_PROJECTS": os.path.join(self.d, "fakeprojects"),
               "LH_CLAUDE": os.path.join(self.d, "bin/claude"),
               "LH_SEND_SETTLE": "0", "LH_SEND_POLL": "0.01", "LH_SEND_VERIFY": "0.05"}
        env.update(extra_env or {})
        old = {k: os.environ.get(k) for k in env}
        output_dir = env.get("LH_DATA_DIR", self.d)
        env["LH_DATA_DIR"] = output_dir
        os.environ.update(env)
        try:
            lh.main(["--root", self.d] + ([] if hasattr(self, "noforce") else ["--force-claude"]) + (["--no-act"] if getattr(self, "dry", False) else []),
                    ctx_hook=self.hook)
        finally:
            for k, v in old.items():
                if v is None:
                    os.environ.pop(k, None)
                else:
                    os.environ[k] = v
        return json.load(open(os.path.join(output_dir, "health.json")))

    def notes_text(self):
        p = os.path.join(self.d, "notes.log")
        return open(p).read() if os.path.exists(p) else ""


def step(i, state, owner=None, **kw):
    d = {"id": i, "title": i, "state": state, "startedAt": "2026-10-13T11:00:00+0000"}
    if owner:
        d["owner"] = owner
    d.update(kw)
    return d


def kinds(h):
    return sorted(p["kind"] for p in h["problems"])


class PaneTests(unittest.TestCase):
    def test_busy_pane_detected_and_prompt_not(self):
        self.assertTrue(lh.classify_pane(BUSY)["busy"])
        self.assertFalse(lh.classify_pane(BUSY)["prompt"])

    def test_idle_prompt(self):
        c = lh.classify_pane(IDLE)
        self.assertTrue(c["prompt"] and not c["busy"])

    def test_permission_prompt(self):
        self.assertTrue(lh.classify_pane(ASK)["needs_input"])

    def test_credits_with_reset_time(self):
        c = lh.classify_pane(CREDITS)
        self.assertTrue(c["credits"])
        self.assertEqual(c["reset"], "3:40 PM")

    def test_timer_line_does_not_change_hash_text(self):
        self.assertEqual(lh.normalize_pane(BUSY), lh.normalize_pane(BUSY2))


class ClaimLockShapeTests(unittest.TestCase):
    def test_parses_a_bare_id_claim_as_id_only(self):
        self.assertEqual(lh.parse_kv_text("API-12\n"), {"item": "API-12"})

    def test_parses_a_key_value_claim_with_lane_and_started(self):
        self.assertEqual(lh.parse_kv_text("item: API-12\nlane: codex-a\nstarted: 2026-10-09T15:04:05Z\n"),
                         {"item": "API-12", "lane": "codex-a", "started": "2026-10-09T15:04:05Z"})

    def test_migrates_a_bare_claim_using_the_lock_that_names_it(self):
        r = Rig(self, [], claims={"API-12": "API-12\n"}, locks={"codex-a": "API-12\n"})
        lh.migrate_legacy_records(r.d)
        claim = open(os.path.join(r.d, "claims/API-12.claim")).read()
        lock = open(os.path.join(r.d, "lane-locks/codex-a.lock")).read()
        self.assertIn("lane: codex-a", claim)
        self.assertIn("started: ", claim)
        self.assertIn("item: API-12", lock)
        self.assertIn("lane: codex-a", lock)

    def test_migrates_a_bare_claim_without_a_matching_lock_to_id_only_metadata(self):
        r = Rig(self, [], claims={"API-13": "API-13\n"})
        lh.migrate_legacy_records(r.d)
        claim = open(os.path.join(r.d, "claims/API-13.claim")).read()
        self.assertIn("item: API-13", claim)
        self.assertIn("lane: \n", claim)
        self.assertIn("started: ", claim)

    def test_migration_preserves_a_credit_note_in_a_lock(self):
        r = Rig(self, [], claims={"API-12": "API-12\n"}, locks={"codex-a": "item: API-12\nnote: usage limit; wait\n"})
        lh.migrate_legacy_records(r.d)
        lock = open(os.path.join(r.d, "lane-locks/codex-a.lock")).read()
        self.assertIn("note: usage limit; wait", lock)


class DerivedStatusTests(unittest.TestCase):
    def test_status_fields_equal_plan_counts_after_plan_change(self):
        r = Rig(self, [step("A-1", "done"), step("B-1", "running", "codex-w1"), step("C-1", "todo")], panes={"codex-w1": BUSY})
        r.run(T0)
        status = json.load(open(os.path.join(r.d, "status.json")))
        self.assertEqual((status["done"], status["total"]), (1, 3))
        self.assertEqual(status["now"], ["B-1"])
        self.assertEqual(status["next"], ["C-1"])

class LandingAndCleanupTests(unittest.TestCase):
    def make_repo(self, r, subject):
        repo = os.path.join(r.d, "repo")
        os.makedirs(repo)
        subprocess.run(["git", "init", "-b", "main", repo], check=True, capture_output=True)
        subprocess.run(["git", "-C", repo, "config", "user.email", "test@invalid"], check=True)
        subprocess.run(["git", "-C", repo, "config", "user.name", "Test"], check=True)
        with open(os.path.join(repo, "file.txt"), "w") as f:
            f.write(subject)
        subprocess.run(["git", "-C", repo, "add", "file.txt"], check=True)
        subprocess.run(["git", "-C", repo, "commit", "-m", subject], check=True, capture_output=True)
        os.makedirs(os.path.join(r.d, ".cockpit"), exist_ok=True)
        with open(os.path.join(r.d, ".cockpit", "config.json"), "w") as f:
            json.dump({"repos": [repo]}, f)
        return repo

    def test_main_commit_subject_starting_with_id_marks_step_done_and_clears_claim(self):
        r = Rig(self, [step("WORK-01", "running", "codex-w1")], claims={"WORK-01": "owner: x\nlane: codex-w1\nstarted: 2026-10-13T11:00:00Z\n"}, locks={"codex-w1": "item: WORK-01\nnote: preserve credit note\n"}, panes={"codex-w1": BUSY})
        r.real_plan = True
        self.make_repo(r, "WORK-01: finish the parser")
        r.run(T0)
        plan = json.load(open(os.path.join(r.d, "plan.json")))
        self.assertEqual(plan["milestones"][0]["steps"][0]["state"], "done")
        self.assertFalse(os.path.exists(os.path.join(r.d, "claims/WORK-01.claim")))
        cleared = os.listdir(os.path.join(r.d, "lane-health/cleared"))
        self.assertTrue(any("WORK-01.claim" in x for x in cleared))
        self.assertIn("landed ", open(r.plan_set_log).read())
        self.assertTrue(os.path.isfile(os.path.join(r.d, "plan-republish.request")))

    def test_commit_in_dirty_claim_worktree_does_not_mark_done(self):
        dirty = tempfile.mkdtemp()
        r = Rig(self, [step("WORK-01", "running", "codex-w1")], claims={"WORK-01": "owner: x\nlane: codex-w1\nworktree: " + dirty + "\n"}, panes={"codex-w1": BUSY})
        r.real_plan = True
        self.addCleanup(lambda: __import__("shutil").rmtree(dirty, ignore_errors=True))
        open(os.path.join(dirty, "uncommitted.txt"), "w").write("dirty")
        self.make_repo(r, "WORK-01: finish the parser")
        r.run(T0)
        plan = json.load(open(os.path.join(r.d, "plan.json")))
        self.assertEqual(plan["milestones"][0]["steps"][0]["state"], "running")

    def test_claim_whose_lock_names_another_item_moves_to_cleared(self):
        r = Rig(self, [step("A-1", "running", "codex-w1")], claims={"A-1": "lane: codex-w1\n"}, locks={"codex-w1": "item: B-1\n"}, panes={"codex-w1": BUSY})
        r.run(T0)
        cleared = os.listdir(os.path.join(r.d, "lane-health/cleared"))
        saved = next(x for x in cleared if "A-1.claim" in x)
        text = open(os.path.join(r.d, "lane-health/cleared", saved)).read()
        self.assertIn("evidence: lane lock names B-1", text)

    def test_reported_claim_at_unchanged_prompt_clears_after_two_checks(self):
        r = Rig(self, [step("A-1", "running", "codex-w1")], claims={"A-1": "lane: codex-w1\n"}, panes={"codex-w1": IDLE})
        r.write("codex-reports/A-1.md", "finished")
        os.utime(os.path.join(r.d, "codex-reports/A-1.md"), (1000, 1000))
        r.run(T0)
        self.assertTrue(os.path.exists(os.path.join(r.d, "claims/A-1.claim")))
        r.run("2026-10-13T12:01:00Z")
        self.assertFalse(os.path.exists(os.path.join(r.d, "claims/A-1.claim")), json.load(open(os.path.join(r.d, "lane-health/state.json"))))
        saved = next(x for x in os.listdir(os.path.join(r.d, "lane-health/cleared")) if "A-1.claim" in x)
        self.assertIn("two checks", open(os.path.join(r.d, "lane-health/cleared", saved)).read())

    def test_cleared_lock_keeps_credit_note(self):
        r = Rig(self, [step("A-1", "blocked", "codex-w1")], locks={"codex-w1": "coordinator: test\nitem: A-1\nnote: usage limit; wait\n"}, panes={"codex-w1": IDLE})
        r.write("codex-reports/A-1.md", "blocked")
        r.run(T0)
        cleared = os.listdir(os.path.join(r.d, "lane-health/cleared"))
        saved = next(x for x in cleared if "codex-w1.lock" in x)
        text = open(os.path.join(r.d, "lane-health/cleared", saved)).read()
        self.assertIn("note: usage limit; wait", text)
        self.assertIn("evidence:", text)


class OrphanTests(unittest.TestCase):
    def test_running_subagent_without_plan_id_gets_one_untitled_off_plan_row_and_queue_entry(self):
        r = Rig(self, [], panes={})
        r.real_plan = True
        subdir = os.path.join(r.d, "lane-health", "subagents")
        os.makedirs(subdir, exist_ok=True)
        with open(os.path.join(subdir, "agent-1.json"), "w") as f:
            json.dump({"agent_id": "agent-1", "description": "Inspect the parser", "subagent_type": "Explore", "started_at": 1791892800000, "updated_at": 1791892800000, "state": "running"}, f)
        r.run(T0, sessions=[], panes={})
        log = open(r.plan_set_log).read()
        self.assertEqual(log.count("AGENT-"), 1)
        self.assertIn("Untitled: Inspect the parser", log)
        queue = json.load(open(os.path.join(r.d, "lane-health/needs-name.json")))
        self.assertEqual(len(queue), 1)
        self.assertIsNone(queue[0]["asked"])

    def test_unknown_busy_lock_gets_one_untitled_off_plan_row(self):
        r = Rig(self, [], locks={"codex-w1": "item: UNKNOWN-1\n"}, panes={"codex-w1": BUSY})
        r.real_plan = True
        r.run(T0)
        self.assertEqual(len(open(r.plan_set_log).read().splitlines()), 1, open(r.plan_set_log).read())
        self.assertIn("Untitled: UNKNOWN-1", open(r.plan_set_log).read())

    def test_running_step_without_live_owner_is_noted_after_two_passes(self):
        r = Rig(self, [step("A-1", "running", "codex-gone")], panes={})
        r.run(T0, sessions=[], panes={})
        self.assertNotIn("No worker seen", open(r.plan_set_log).read() if os.path.exists(r.plan_set_log) else "")
        r.run("2026-10-13T12:01:00Z", sessions=[], panes={})
        self.assertIn("No worker seen since", open(r.plan_set_log).read())

    def test_needs_name_queue_is_deduplicated_for_same_worker(self):
        r = Rig(self, [], panes={})
        r.real_plan = True
        subdir = os.path.join(r.d, "lane-health", "subagents")
        os.makedirs(subdir, exist_ok=True)
        with open(os.path.join(subdir, "agent-1.json"), "w") as f:
            json.dump({"agent_id": "agent-1", "description": "Inspect the parser", "subagent_type": "Explore", "started_at": 1791892800000, "updated_at": 1791892800000, "state": "running"}, f)
        r.run(T0, sessions=[], panes={})
        r.run("2026-10-13T12:01:00Z", sessions=[], panes={})
        queue = json.load(open(os.path.join(r.d, "lane-health/needs-name.json")))
        self.assertEqual(len(queue), 1)
        self.assertEqual(len(open(r.plan_set_log).read().splitlines()), 1, open(r.plan_set_log).read())

    def test_subagent_naming_existing_plan_id_attaches_without_new_row(self):
        r = Rig(self, [step("WORK-01", "running")], panes={})
        subdir = os.path.join(r.d, "lane-health", "subagents")
        os.makedirs(subdir, exist_ok=True)
        with open(os.path.join(subdir, "agent-1.json"), "w") as f:
            json.dump({"agent_id": "agent-1", "description": "Review WORK-01 changes", "subagent_type": "Explore", "started_at": 1791892800000, "updated_at": 1791892800000, "state": "running"}, f)
        r.run(T0, sessions=[], panes={})
        self.assertFalse(os.path.exists(r.plan_set_log))
        self.assertFalse(os.path.exists(os.path.join(r.d, "lane-health/needs-name.json")))

    def test_no_prompt_text_is_copied_to_title_or_queue(self):
        r = Rig(self, [], panes={})
        r.real_plan = True
        subdir = os.path.join(r.d, "lane-health", "subagents")
        os.makedirs(subdir, exist_ok=True)
        with open(os.path.join(subdir, "agent-1.json"), "w") as f:
            json.dump({"agent_id": "agent-1", "description": "Inspect /private/path", "prompt": "SECRET PROMPT", "subagent_type": "Explore", "started_at": 1791892800000, "updated_at": 1791892800000, "state": "running"}, f)
        r.run(T0, sessions=[], panes={})
        content = open(os.path.join(r.d, "lane-health/needs-name.json")).read() + open(r.plan_set_log).read()
        self.assertNotIn("SECRET PROMPT", content)
        self.assertNotIn("/private/path", content)


class LaneTests(unittest.TestCase):
    def test_health_json_shape_and_atomic_write(self):
        r = Rig(self, [step("A-1", "running", "codex-w1")], panes={"codex-w1": BUSY})
        h = r.run(T0)
        self.assertEqual((h["intervalSec"], h["claudeIntervalSec"]), (60, 120))
        e = h["items"]["A-1"]
        self.assertEqual((e["owner"], e["state"]), ("codex-w1", "working"))
        self.assertTrue(e["lastActivityAt"] and e["detail"])
        self.assertFalse([f for f in os.listdir(r.d) if ".tmp" in f])

    def test_health_json_can_be_written_to_configured_data_directory(self):
        r = Rig(self, [step("A-1", "running", "codex-w1")], panes={"codex-w1": BUSY})
        out = os.path.join(r.d, "configured-data")
        r.run(T0, extra_env={"LH_DATA_DIR": out})
        self.assertTrue(os.path.isfile(os.path.join(out, "health.json")))
        self.assertFalse(os.path.exists(os.path.join(r.d, "health.json")))

    def test_newer_report_emits_one_prompt_free_done_event(self):
        r = Rig(self, [step("A-1", "running", "codex-w1")], claims={"A-1": "owner: x\nlane: codex-w1\n"}, panes={"codex-w1": IDLE})
        claim = os.path.join(r.d, "claims/A-1.claim")
        os.utime(claim, (1000, 1000))
        r.write("codex-reports/A-1.md", "report contains no event prompt")
        r.run(T0)
        path = os.path.join(r.d, "lane-health/events.jsonl")
        lines = open(path).read().splitlines()
        self.assertEqual(len(lines), 1)
        ev = json.loads(lines[0])
        self.assertEqual((ev["item"], ev["lane"], ev["state"]), ("A-1", "codex-w1", "done"))
        self.assertNotIn("prompt", lines[0])
        r.run("2026-10-13T12:01:00Z")
        self.assertEqual(len(open(path).read().splitlines()), 1)

    def test_done_event_updates_plan_clears_claim_and_lane_item_but_keeps_credit_note(self):
        r = Rig(self, [step("A-1", "running", "codex-w1")], claims={"A-1": "owner: x\nlane: codex-w1\n"}, locks={"codex-w1": "coordinator: x\nitem: A-1\nnote: usage limit; send nothing\n"}, panes={"codex-w1": BUSY})
        os.utime(os.path.join(r.d, "claims/A-1.claim"), (1000, 1000))
        r.write("codex-reports/A-1.md", "completed")
        r.write("lane-health/events.jsonl", json.dumps({"id": "e1", "item": "A-1", "lane": "codex-w1", "state": "done", "time": T0}) + "\n")
        r.run(T0)
        self.assertIn("A-1 done", open(r.plan_set_log).read())
        self.assertFalse(os.path.exists(os.path.join(r.d, "claims/A-1.claim")))
        lock = open(os.path.join(r.d, "lane-locks/codex-w1.lock")).read()
        self.assertIn("item: \n", lock)
        self.assertIn("note: usage limit; send nothing", lock)
        self.assertTrue(os.path.isfile(os.path.join(r.d, "plan-republish.request")))
        self.assertEqual(open(os.path.join(r.d, "lane-health/events.jsonl")).read(), "")

    def test_malformed_event_is_skipped_and_logged(self):
        r = Rig(self, [step("A-1", "running", "codex-w1")], panes={"codex-w1": BUSY})
        r.write("lane-health/events.jsonl", "{bad json}\n" + json.dumps({"item": "A-1", "lane": "codex-w1", "state": "done", "time": T0}) + "\n")
        r.run(T0)
        self.assertIn("events.malformed.log", os.listdir(os.path.join(r.d, "lane-health")))

    def test_idle_lane_flags_after_three_minutes_with_todo_work(self):
        r = Rig(self, [step("A-1", "todo"), step("B-1", "running", "codex-w1")], panes={"codex-w1": IDLE})
        self.assertNotIn("idle-lane", kinds(r.run(T0)))
        h = r.run("2026-10-13T12:04:00Z")
        self.assertIn("idle-lane", kinds(h))

    def test_idle_lane_quiet_without_todo(self):
        r = Rig(self, [step("B-1", "running", "codex-w1")], panes={"codex-w1": IDLE})
        r.run(T0)
        self.assertNotIn("idle-lane", kinds(r.run("2026-10-13T12:10:00Z")))

    def test_old_report_does_not_make_a_busy_lane_finished(self):
        r = Rig(self, [step("A-1", "running", "codex-w1")], claims={"A-1": "owner: x\nlane: codex-w1\n"}, panes={"codex-w1": BUSY})
        os.utime(os.path.join(r.d, "claims/A-1.claim"), (1000, 1000))
        r.write("codex-reports/A-1.md", "stale")
        h = r.run(T0)
        self.assertEqual(h["items"]["A-1"]["state"], "working")
        self.assertNotIn("unread-report", kinds(h))

    def test_unread_report_newer_than_claim(self):
        r = Rig(self, [step("A-1", "running", "codex-w1")], claims={"A-1": "owner: x\nlane: codex-w1\n"}, panes={"codex-w1": IDLE})
        os.utime(os.path.join(r.d, "claims/A-1.claim"), (1000, 1000))
        r.write("codex-reports/A-1.md", "done")
        h = r.run(T0)
        self.assertIn("unread-report", kinds(h))
        self.assertEqual(h["items"]["A-1"]["state"], "finished")

    def test_hung_after_twenty_minutes_unchanged(self):
        r = Rig(self, [step("A-1", "running", "codex-w1")], claims={"A-1": "lane: codex-w1\nworktree: %s\n" % tempfile.gettempdir()},
                panes={"codex-w1": BUSY})
        r.run(T0)
        self.assertNotIn("hung", kinds(r.run("2026-10-13T12:10:00Z", panes={"codex-w1": BUSY2})))
        h = r.run("2026-10-13T12:21:00Z", panes={"codex-w1": BUSY})
        self.assertIn("hung", kinds(h))
        self.assertEqual(h["items"]["A-1"]["state"], "stale")

    def test_worktree_change_resets_hung_clock(self):
        r = Rig(self, [step("A-1", "running", "codex-w1")], claims={"A-1": "lane: codex-w1\nworktree: %s\n" % tempfile.gettempdir()},
                panes={"codex-w1": BUSY})
        r.run(T0)
        r.hook["fingerprint"] = lambda p: "fp2"
        self.assertNotIn("hung", kinds(r.run("2026-10-13T12:21:00Z")))

    def test_needs_input(self):
        r = Rig(self, [step("A-1", "running", "codex-w1")], panes={"codex-w1": ASK})
        h = r.run(T0)
        self.assertEqual(h["items"]["A-1"]["state"], "needs-input")
        self.assertIn("needs-input", kinds(h))

    def test_dead_when_session_gone_and_claim_exists(self):
        r = Rig(self, [step("A-1", "running", "codex-w2")], claims={"A-1": "lane: codex-w2\n"}, panes={"codex-w1": IDLE})
        h = r.run(T0, sessions=["codex-w1"])
        self.assertEqual(h["items"]["A-1"]["state"], "dead")
        self.assertIn("dead", kinds(h))

    def test_claim_with_no_lane_is_dead(self):
        r = Rig(self, [], claims={"Z-1": "started: now\n"})
        self.assertIn("dead", kinds(r.run(T0, sessions=[], panes={})))

    def test_credits_problem_records_reset(self):
        r = Rig(self, [step("A-1", "running", "codex-w1")], panes={"codex-w1": CREDITS})
        h = r.run(T0)
        p = [p for p in h["problems"] if p["kind"] == "credits"][0]
        self.assertIn("3:40 PM", p["detail"])

    def test_reika_port_down(self):
        r = Rig(self, [], locks={"reika-9b": "lane: reika-9b (port 54800)\nstate: server up, idle\n"})
        r.hook["port_open"] = lambda p: False
        self.assertIn("reika-down", kinds(r.run(T0, sessions=[], panes={})))
        r.hook["port_open"] = lambda p: True
        self.assertNotIn("reika-down", kinds(r.run(T0, sessions=[], panes={})))

    def test_gate_lock_held_by_dead_pid(self):
        r = Rig(self, [])
        gd = os.path.join(r.d, "gatebase", "gate-lock")
        os.makedirs(gd)
        open(os.path.join(gd, "holder"), "w").write("home-1\tA-1\t99999\t2026-10-13T11:00:00Z\n")
        r.hook["pid_alive"] = lambda p: False
        h = r.run(T0, sessions=[], panes={}, extra_env={"LH_GATE_DIR": os.path.join(r.d, "gatebase")})
        self.assertIn("gate-lock-stale", kinds(h))

    def test_unpushed_commits_reported(self):
        r = Rig(self, [], claims={"A-1": "lane: claude\nworktree: %s\n" % tempfile.gettempdir()})
        r.hook["repo_of"] = lambda p: "/x/home"
        r.hook["unpushed"] = lambda repo: 3
        self.assertIn("unpushed", kinds(r.run(T0, sessions=[], panes={})))

    def test_status_older_than_plan(self):
        r = Rig(self, [])
        os.utime(os.path.join(r.d, "status.json"), (1000, 1000))
        self.assertNotIn("status-stale", kinds(r.run(T0, sessions=[], panes={})))

    def test_running_step_without_owner(self):
        r = Rig(self, [step("A-1", "running")])
        self.assertIn("stale", kinds(r.run(T0, sessions=[], panes={})))


class ActionTests(unittest.TestCase):
    def test_dead_lane_blocks_plan_step_and_requests_republish(self):
        r = Rig(self, [step("A-1", "running", "codex-w2")], claims={"A-1": "lane: codex-w2\n"})
        r.run(T0, sessions=[], panes={})
        log = open(r.plan_set_log).read()
        self.assertIn("A-1 blocked", log)
        self.assertTrue(os.path.exists(os.path.join(r.d, "plan-republish.request")))
        self.assertTrue(os.path.exists(r.plan_set_log + ".build"))

    def test_auto_blocked_step_returns_to_running_when_lane_works(self):
        r = Rig(self, [step("A-1", "running", "codex-w2")], claims={"A-1": "lane: codex-w2\n"})
        r.run(T0, sessions=[], panes={})
        r.set_plan([step("A-1", "blocked", "codex-w2")])
        r.run("2026-10-13T12:05:00Z", panes={"codex-w2": BUSY})
        self.assertIn("A-1 running", open(r.plan_set_log).read())

    def test_hand_blocked_step_is_left_alone(self):
        r = Rig(self, [step("A-1", "blocked", "codex-w1")], panes={"codex-w1": BUSY})
        r.run(T0)
        self.assertFalse(os.path.exists(r.plan_set_log) and "A-1" in open(r.plan_set_log).read())

    def test_no_act_changes_nothing(self):
        r = Rig(self, [step("A-1", "running", "codex-w2")], claims={"A-1": "lane: codex-w2\n"})
        r.noforce = True
        os.environ.update({"LH_TMUX": "true", "LH_NOW": T0, "LH_NOTIFY": os.path.join(r.d, "bin/notify"),
                           "LH_PLAN_SET": os.path.join(r.d, "bin/plan-set"), "LH_GATE_DIR": r.d + "/ng", "LH_DATA_DIR": r.d})
        try:
            lh.main(["--root", r.d, "--no-act"], ctx_hook=r.hook)
        finally:
            for k in ("LH_TMUX", "LH_NOW", "LH_NOTIFY", "LH_PLAN_SET", "LH_GATE_DIR", "LH_DATA_DIR"):
                os.environ.pop(k, None)
        self.assertFalse(os.path.exists(r.plan_set_log))
        self.assertEqual(r.notes_text(), "")
        self.assertTrue(os.path.exists(os.path.join(r.d, "health.json")))

    def test_notify_once_then_hourly_reminder(self):
        r = Rig(self, [step("A-1", "running", "codex-w2")], claims={"A-1": "lane: codex-w2\n"})
        r.run(T0, sessions=[], panes={})
        n1 = r.notes_text().count("\n")
        self.assertEqual(n1, 1)
        r.run("2026-10-13T12:30:00Z", sessions=[], panes={})
        self.assertEqual(r.notes_text().count("\n"), 1)
        r.run("2026-10-13T13:05:00Z", sessions=[], panes={})
        self.assertEqual(r.notes_text().count("\n"), 2)

    def test_healthy_run_is_quiet(self):
        r = Rig(self, [step("A-1", "running", "codex-w1")], panes={"codex-w1": BUSY})
        r.run(T0)
        self.assertEqual(r.notes_text(), "")
        self.assertFalse(os.path.exists(r.plan_set_log))

    def test_resolved_problem_can_notify_again_later(self):
        r = Rig(self, [step("A-1", "running", "codex-w1")], panes={"codex-w1": ASK})
        r.run(T0)
        r.run("2026-10-13T12:01:00Z", panes={"codex-w1": BUSY})
        r.run("2026-10-13T12:02:00Z", panes={"codex-w1": ASK})
        self.assertEqual(r.notes_text().count("\n"), 2)


class ClaudeScanTests(unittest.TestCase):
    def mk(self, d, rel, lines, age):
        p = os.path.join(d, rel)
        os.makedirs(os.path.dirname(p), exist_ok=True)
        open(p, "w").write("\n".join(json.dumps(l) for l in lines) + "\n")
        t = lh.parse_iso(T0).timestamp() - age
        os.utime(p, (t, t))

    def setUp(self):
        self.d = tempfile.mkdtemp()
        self.addCleanup(lambda: __import__("shutil").rmtree(self.d, ignore_errors=True))
        fake = os.path.join(self.d, "claude")
        open(fake, "w").write("#!/bin/sh\necho '[]'\n")
        os.chmod(fake, 0o755)
        os.environ["LH_CLAUDE"] = fake
        self.addCleanup(lambda: os.environ.pop("LH_CLAUDE", None))

    def test_subagent_hung_mid_tool(self):
        self.mk(self.d, "p/s1/subagents/agent-1.jsonl",
                [{"type": "assistant", "message": {"content": [{"type": "tool_use"}]}}], 900)
        r = lh.claude_scan(lh.parse_iso(T0), self.d)
        self.assertEqual(len(r["hung"]), 1)

    def test_old_subagent_not_hung(self):
        self.mk(self.d, "p/s1/subagents/agent-1.jsonl",
                [{"type": "assistant", "message": {"content": [{"type": "tool_use"}]}}], 7200)
        self.assertEqual(lh.claude_scan(lh.parse_iso(T0), self.d)["hung"], [])

    def test_finished_subagent(self):
        self.mk(self.d, "p/s1/subagents/agent-2.jsonl",
                [{"type": "assistant", "message": {"content": [{"type": "text"}]}}, {"type": "cost-state"}], 120)
        self.assertEqual(len(lh.claude_scan(lh.parse_iso(T0), self.d)["finishedSubagents"]), 1)

    def test_bookkeeping_lines_skipped(self):
        self.mk(self.d, "p/x.jsonl", [{"type": "assistant", "message": {"content": [{"type": "tool_use"}]}},
                                      {"type": "queue-operation"}, {"type": "cost-state"}], 10)
        self.assertEqual(lh.last_meaningful(os.path.join(self.d, "p/x.jsonl")), "assistant-tool")

    def test_session_waiting_when_live_and_turn_ended(self):
        self.mk(self.d, "p/abc.jsonl", [{"type": "assistant", "message": {"content": [{"type": "text"}]}}], 600)
        fake = os.environ["LH_CLAUDE"]
        open(fake, "w").write("#!/bin/sh\necho '[{\"pid\":1,\"sessionId\":\"abc\",\"kind\":\"interactive\",\"name\":\"N\",\"status\":\"idle\"}]'\n")
        r = lh.claude_scan(lh.parse_iso(T0), self.d)
        self.assertEqual(len(r["waiting"]), 1)
        probs = lh.claude_problems(r)
        self.assertEqual(probs[0]["kind"], "claude-waiting")

    def coord(self, lines, age):
        self.mk(self.d, lh.COORD_DIR + "/main.jsonl", lines, age)
        return lh.coordinator_state(lh.parse_iso(T0), self.d)

    def test_coordinator_working_on_tool_call_names_the_tool_only(self):
        c = self.coord([{"type": "assistant", "message": {"content": [{"type": "tool_use", "name": "Bash", "input": {"command": "secret"}}]}}], 90)
        self.assertEqual((c["state"], c["detail"]), ("working", "ran a command"))

    def test_coordinator_working_on_recent_write(self):
        c = self.coord([{"type": "assistant", "message": {"content": [{"type": "text", "text": "hi"}]}}], 5)
        self.assertEqual(c["state"], "working")

    def test_coordinator_waiting_on_open_ask_user_question(self):
        c = self.coord([{"type": "assistant", "message": {"content": [{"type": "tool_use", "name": "AskUserQuestion"}]}}], 400)
        self.assertEqual(c["state"], "waiting")

    def reply(self, text):
        return [{"type": "assistant", "message": {"content": [{"type": "text", "text": text}]}}]

    def test_coordinator_ended_turn_asking_nothing_is_idle(self):
        c = self.coord(self.reply("All landed.\n\nSTATE: done \u00b7 landed X \u00b7 YOU: nothing"), 60)
        self.assertEqual((c["state"], c["detail"]), ("idle", "finished its turn, nothing needed from Jesse"))
        self.assertEqual(self.coord(self.reply("Plain answer with no footer."), 60)["state"], "idle")

    def test_coordinator_state_line_waiting_or_you_ask_is_waiting(self):
        self.assertEqual(self.coord(self.reply("x\nSTATE: waiting [codex-w1] \u00b7 brief sent \u00b7 YOU: do y"), 60)["state"], "waiting")
        self.assertEqual(self.coord(self.reply("x\nSTATE: active \u00b7 build \u00b7 YOU: run the thing"), 300)["state"], "waiting")
        self.assertEqual(self.coord(self.reply("x\nYOU: pick one"), 60)["state"], "waiting")

    def test_coordinator_open_ask_user_question_stays_waiting(self):
        c = self.coord([{"type": "assistant", "message": {"content": [{"type": "tool_use", "name": "AskUserQuestion"}]}}], 900)
        self.assertEqual(c["state"], "waiting")

    def test_coordinator_ignores_subagents_and_picks_newest_main(self):
        self.mk(self.d, lh.COORD_DIR + "/old.jsonl", [{"type": "assistant", "message": {"content": [{"type": "text"}]}}], 5000)
        self.mk(self.d, lh.COORD_DIR + "/main/subagents/agent-1.jsonl", [{"type": "user", "message": {"content": []}}], 1)
        c = self.coord([{"type": "user", "message": {"content": [{"type": "tool_result"}]}}], 60)
        self.assertEqual((c["state"], c["detail"]), ("working", "got a tool result"))

    def test_coordinator_none_without_transcript(self):
        self.assertIsNone(lh.coordinator_state(lh.parse_iso(T0), self.d))

    def test_live_subagents_counted_from_recent_writes(self):
        self.mk(self.d, "p/s1/subagents/agent-1.jsonl", [{"type": "assistant", "message": {"content": [{"type": "tool_use"}]}}], 30)
        self.mk(self.d, "p/s1/subagents/agent-2.jsonl", [{"type": "assistant", "message": {"content": [{"type": "tool_use"}]}}], 500)
        self.assertEqual(lh.claude_scan(lh.parse_iso(T0), self.d)["liveSubagents"], 1)

    def test_cloud_sessions_flagged_not_listable(self):
        self.assertFalse(lh.claude_scan(lh.parse_iso(T0), self.d)["cloudSessionsListable"])


class PlanHealthTests(unittest.TestCase):
    def test_plan_idle_fires_after_two_minutes_once_per_episode(self):
        r = Rig(self, [step("A-1", "todo")])
        self.assertNotIn("plan-idle", kinds(r.run(T0)))
        self.assertNotIn("plan-idle", kinds(r.run("2026-10-13T12:01:00Z")))
        self.assertIn("plan-idle", kinds(r.run("2026-10-13T12:02:30Z")))
        self.assertEqual(r.notes_text().count("Nothing is running"), 1)
        r.run("2026-10-13T14:00:00Z")
        self.assertEqual(r.notes_text().count("Nothing is running"), 1)

    def test_plan_idle_new_episode_notifies_again(self):
        r = Rig(self, [step("A-1", "todo")])
        r.run(T0)
        r.run("2026-10-13T12:03:00Z")
        r.set_plan([step("A-1", "running", "claude")])
        self.assertNotIn("plan-idle", kinds(r.run("2026-10-13T12:04:00Z")))
        r.set_plan([step("A-1", "todo")])
        r.run("2026-10-13T12:05:00Z")
        r.run("2026-10-13T12:08:00Z")
        self.assertEqual(r.notes_text().count("Nothing is running"), 2)

    def test_plan_idle_quiet_when_something_runs_or_blocked_on_you_or_no_todo(self):
        for steps in ([step("A-1", "todo"), step("B-1", "running", "claude")],
                      [step("A-1", "todo"), step("B-1", "blocked", "you")],
                      [step("A-1", "done")]):
            r = Rig(self, steps)
            r.run(T0)
            self.assertNotIn("plan-idle", kinds(r.run("2026-10-13T12:05:00Z")))

    def test_plan_idle_quiet_with_busy_lane_or_live_subagent(self):
        r = Rig(self, [step("A-1", "todo")], panes={"codex-w1": BUSY})
        r.run(T0)
        self.assertNotIn("plan-idle", kinds(r.run("2026-10-13T12:05:00Z")))
        r = Rig(self, [step("A-1", "todo")])
        r.hook["claude_scan"] = lambda now: {"checkedAt": lh.iso(now), "waiting": [], "hung": [], "finishedSubagents": [],
                                              "live": [], "recentActivityAt": None, "liveSubagents": 1}
        r.run(T0)
        self.assertNotIn("plan-idle", kinds(r.run("2026-10-13T12:05:00Z")))

    def test_ready_uses_previous_step_and_dependson_and_owner(self):
        plan = {"milestones": [{"id": "m", "steps": [step("A", "done"), step("B", "todo"), step("C", "todo"),
                                                      step("D", "todo", dependsOn=["A"]), step("E", "todo", "codex-w1"),
                                                      step("F", "todo", dependsOn="C")]},
                               {"id": "n", "steps": [step("G", "todo")]}]}
        self.assertEqual(lh.ready_steps(plan), ["B", "D"])
        plan["milestones"][0]["steps"] = [step("A", "done"), step("B", "done")]
        self.assertEqual(lh.ready_steps(plan), ["G"])
        self.assertEqual(lh.ready_steps(plan, {"G": {}}), [])

    def test_health_json_lists_ready(self):
        r = Rig(self, [step("A", "done"), step("B", "todo"), step("C", "todo")])
        h = r.run(T0)
        self.assertEqual((h["ready"], h["readyCount"]), (["B"], 1))

    def test_ready_unassigned_fires_with_idle_lane_after_two_minutes_once(self):
        r = Rig(self, [step("A", "done"), step("B", "todo"), step("C", "running", "codex-w1")], panes={"codex-w1": IDLE})
        self.assertNotIn("ready-unassigned", kinds(r.run(T0)))
        h = r.run("2026-10-13T12:03:00Z")
        self.assertIn("ready-unassigned", kinds(h))
        r.run("2026-10-13T15:00:00Z")
        self.assertEqual(r.notes_text().count("ready steps have no owner"), 1)

    def test_ready_unassigned_quiet_without_idle_lane_or_ready(self):
        r = Rig(self, [step("A", "done"), step("B", "todo"), step("C", "running", "codex-w1")], panes={"codex-w1": BUSY})
        r.run(T0)
        self.assertNotIn("ready-unassigned", kinds(r.run("2026-10-13T12:05:00Z")))
        r = Rig(self, [step("C", "running", "codex-w1"), step("A", "todo"), step("B", "todo")], panes={"codex-w1": IDLE})
        r.run(T0)
        h = r.run("2026-10-13T12:05:00Z")
        self.assertEqual(h["ready"], [])
        self.assertNotIn("ready-unassigned", kinds(h))


class AutoDispatchTests(unittest.TestCase):
    """LANE-HEALTH-03. Each rig has an idle lane (codex-w1) and one ready step B; guards are removed one at a time."""

    def rig(self, switch=True, brief=True, verdict="verdict: APPROVED\n", claim=False, lock=False, report_unread=False):
        steps = [step("A", "done"), step("B", "todo")]
        if report_unread:
            steps = [step("U", "running", "codex-w1")] + steps
        r = Rig(self, steps, panes={"codex-w1": IDLE})
        for sub in ("architect", "briefs", "lane-health"):
            os.makedirs(os.path.join(r.d, sub), exist_ok=True)
        if switch:
            r.write("lane-health/auto-dispatch.on", "")
        if brief:
            r.write("briefs/B.md", "# B\n")
        if verdict is not None:
            r.write("architect/B.verdict", verdict)
        if claim:
            r.write("claims/B.claim", "owner: x\nlane: codex-y\n")
        if lock:
            r.write("lane-locks/codex-w1.lock", "item: Z\n")
        if report_unread:
            r.write("claims/U.claim", "owner: x\nlane: codex-w1\n")
            os.utime(os.path.join(r.d, "claims/U.claim"), (1000, 1000))
            r.write("codex-reports/U.md", "done")
        r.run(T0)
        return r

    def go(self, r):
        return r.run("2026-10-13T12:03:00Z")

    def sent(self, r):
        p = os.path.join(r.d, "sendkeys.log")
        return open(p).read() if os.path.exists(p) else ""

    def test_dispatches_when_every_guard_holds(self):
        r = self.rig()
        h = self.go(r)
        self.assertEqual([(d["item"], d["lane"]) for d in h["autoDispatch"]["dispatched"]], [("B", "codex-w1")])
        self.assertTrue(h["autoDispatch"]["on"])
        self.assertIn("briefs/B.md", self.sent(r))
        self.assertIn("Enter", self.sent(r))
        self.assertTrue(os.path.exists(os.path.join(r.d, "claims/B.claim")))
        self.assertIn("item: B", open(os.path.join(r.d, "lane-locks/codex-w1.lock")).read())
        self.assertIn("B running codex-w1", open(r.plan_set_log).read())
        self.assertIn("Auto-dispatched B", r.notes_text())

    def test_does_not_dispatch_twice(self):
        r = self.rig()
        self.go(r)
        h = r.run("2026-10-13T12:06:00Z")
        self.assertEqual(h["autoDispatch"]["dispatched"], [])
        self.assertEqual(self.sent(r).count("briefs/B.md"), 1)

    def test_switch_off_means_no_dispatch(self):
        r = self.rig(switch=False)
        h = self.go(r)
        self.assertFalse(h["autoDispatch"]["on"])
        self.assertEqual((h["autoDispatch"]["dispatched"], self.sent(r)), ([], ""))

    def test_each_missing_guard_blocks(self):
        for kw, why in ((dict(brief=False), "no brief"), (dict(verdict=None), "APPROVED"), (dict(verdict="verdict: REJECTED\n"), "APPROVED"),
                        (dict(claim=True), "claim exists"), (dict(lock=True), "lock file")):
            r = self.rig(**kw)
            h = self.go(r)
            self.assertEqual(h["autoDispatch"]["dispatched"], [], kw)
            self.assertEqual(self.sent(r), "", kw)
            self.assertTrue(why == "claim exists" or any(why in x for x in h["autoDispatch"]["skipped"]), kw)

    def test_unread_report_blocks(self):
        r = self.rig(report_unread=True)
        h = self.go(r)
        self.assertEqual(h["autoDispatch"]["dispatched"], [])
        self.assertTrue(any("not read" in x for x in h["autoDispatch"]["skipped"]))

    def test_architect_not_required_line_skips_verdict(self):
        r = self.rig(verdict=None)
        r.write("briefs/B.md", "# B\nARCHITECT: not required\n")
        h = self.go(r)
        self.assertEqual(len(h["autoDispatch"]["dispatched"]), 1)

    def test_lane_must_be_idle_two_minutes_first(self):
        r = self.rig()
        h = r.run("2026-10-13T12:01:00Z")
        self.assertEqual(h["autoDispatch"]["dispatched"], [])

    def test_dry_run_reports_would_dispatch_and_changes_nothing(self):
        r = self.rig()
        r.dry = True
        h = self.go(r)
        self.assertEqual(h["autoDispatch"]["wouldDispatch"], [{"item": "B", "lane": "codex-w1"}])
        self.assertEqual(h["autoDispatch"]["dispatched"], [])
        self.assertEqual(self.sent(r), "")
        self.assertFalse(os.path.exists(os.path.join(r.d, "claims/B.claim")))
        self.assertFalse(os.path.exists(os.path.join(r.d, "lane-locks/codex-w1.lock")))


class UnsentMessageTests(unittest.TestCase):
    """LANE-HEALTH-04. Codex swallows an Enter that follows typed text at once; the checker retries and rescues."""
    TYPED = "\n  Worked for 34s\n\n\u203a Read and do exactly the brief at /x/briefs/B.md.\n\n  GPT-6-Luna low\n"

    def rig(self, pane):
        r = Rig(self, [step("A", "done")], panes={"codex-w1": pane})
        return r

    def sent(self, r):
        p = os.path.join(r.d, "sendkeys.log")
        return open(p).read() if os.path.exists(p) else ""

    def test_composer_text_ignores_placeholder_and_empty(self):
        self.assertEqual(lh.composer_text(IDLE), "")
        self.assertEqual(lh.composer_text(BUSY), "")
        self.assertIn("brief at", lh.composer_text(self.TYPED))

    def test_placeholder_is_never_flagged_or_pressed(self):
        r = self.rig(IDLE)
        r.run(T0)
        h = r.run("2026-10-13T12:05:00Z")
        self.assertEqual([p for p in h["problems"] if p["kind"] == "unsent-message"], [])
        self.assertEqual(h["autoFixed"], [])
        self.assertNotIn("Enter", self.sent(r))

    def test_typed_text_flagged_after_20s_and_enter_pressed_once_per_minute(self):
        r = self.rig(self.TYPED)
        h = r.run(T0)
        self.assertEqual([p for p in h["problems"] if p["kind"] == "unsent-message"], [])   # under 20 s
        self.assertNotIn("Enter", self.sent(r))
        h = r.run("2026-10-13T12:00:30Z")
        self.assertEqual([p["id"] for p in h["problems"] if p["kind"] == "unsent-message"], ["unsent-message:codex-w1"])
        self.assertEqual([f["lane"] for f in h["autoFixed"]], ["codex-w1"])
        self.assertEqual(self.sent(r).count("Enter"), 1)
        r.run("2026-10-13T12:01:00Z")                       # 30 s after the press: no second Enter
        self.assertEqual(self.sent(r).count("Enter"), 1)
        h = r.run("2026-10-13T12:01:40Z")                   # 70 s after: press again
        self.assertEqual(self.sent(r).count("Enter"), 2)
        self.assertEqual(len(h["autoFixed"]), 1)

    def test_busy_lane_with_typed_text_is_not_flagged(self):
        r = self.rig("doing things\n\u2022 Working (3m 12s \u2022 esc to interrupt)\n\u203a queued follow-up\n")
        r.run(T0)
        h = r.run("2026-10-13T12:05:00Z")
        self.assertEqual([p for p in h["problems"] if p["kind"] == "unsent-message"], [])
        self.assertNotIn("Enter", self.sent(r))

    def test_no_act_reports_problem_but_presses_nothing(self):
        r = self.rig(self.TYPED)
        r.dry = True
        r.run(T0)
        h = r.run("2026-10-13T12:00:30Z")
        self.assertEqual(len([p for p in h["problems"] if p["kind"] == "unsent-message"]), 1)
        self.assertEqual(h["autoFixed"], [])
        self.assertNotIn("Enter", self.sent(r))

    def test_typed_lane_is_not_offered_to_auto_dispatch(self):
        r = Rig(self, [step("A", "done"), step("B", "todo")], panes={"codex-w1": self.TYPED})
        for sub in ("architect", "briefs", "lane-health"):
            os.makedirs(os.path.join(r.d, sub), exist_ok=True)
        r.write("lane-health/auto-dispatch.on", "")
        r.write("briefs/B.md", "# B\nARCHITECT: not required\n")
        r.run(T0)
        h = r.run("2026-10-13T12:03:00Z")
        self.assertEqual(h["autoDispatch"]["dispatched"], [])


class SendToLaneTests(unittest.TestCase):
    """LANE-HEALTH-04. send_to_lane with a scripted tmux: Enter swallowed, then taken."""

    def setUp(self):
        self.keys, self.panes = [], []
        self.orig = (lh.run, lh.tmux_capture, lh.time.sleep)
        os.environ.update({"LH_SEND_SETTLE": "0", "LH_SEND_POLL": "0.01", "LH_SEND_VERIFY": "0.03"})

        def fake_run(cmd, timeout=10, cwd=None):
            self.keys.append(cmd[-1])
            return 0, ""
        lh.run = fake_run
        lh.time.sleep = lambda s: None
        lh.tmux_capture = lambda s: self.panes.pop(0) if len(self.panes) > 1 else self.panes[0]

    def tearDown(self):
        lh.run, lh.tmux_capture, lh.time.sleep = self.orig
        for k in ("LH_SEND_SETTLE", "LH_SEND_POLL", "LH_SEND_VERIFY"):
            os.environ.pop(k, None)

    TYPED = "\u203a hello brief pointer\n"

    def test_enter_taken_first_time(self):
        self.panes = [BUSY]
        ok, _ = lh.send_to_lane("codex-w1", "hello brief pointer")
        self.assertTrue(ok)
        self.assertEqual(self.keys.count("Enter"), 1)

    def test_swallowed_enter_is_retried_until_taken(self):
        self.panes = [self.TYPED] * 8 + [BUSY]
        ok, msg = lh.send_to_lane("codex-w1", "hello brief pointer")
        self.assertTrue(ok, msg)
        self.assertGreaterEqual(self.keys.count("Enter"), 2)

    def test_gives_up_after_three_presses_with_clear_message(self):
        self.panes = [self.TYPED]
        ok, msg = lh.send_to_lane("codex-w1", "hello brief pointer")
        self.assertFalse(ok)
        self.assertEqual(self.keys.count("Enter"), 3)
        self.assertIn("press Enter yourself", msg)


if __name__ == "__main__":
    unittest.main()

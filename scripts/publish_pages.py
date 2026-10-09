"""Explicitly build Pages after a bot commit, and verify the published revision."""
import json
import os
import subprocess
import time
import urllib.request

def api(path, method="GET"):
    repo = os.environ["GITHUB_REPOSITORY"]
    request = urllib.request.Request(
        "https://api.github.com/repos/" + repo + path,
        method=method,
        headers={"Authorization":"Bearer "+os.environ["GITHUB_TOKEN"],
                 "Accept":"application/vnd.github+json", "User-Agent":"Splintermetrics-Transfer-Brain"})
    with urllib.request.urlopen(request, timeout=45) as response:
        return json.load(response)

def publish():
    pages = api("/pages")
    if pages.get("build_type") == "workflow" or pages.get("source", {}).get("branch") != "main" or pages.get("source", {}).get("path") != "/":
        raise RuntimeError("This refresh uses Pages publishing from main / (root); restore that source in Settings > Pages")
    subprocess.run(["git","config","user.name","github-actions[bot]"],check=True)
    subprocess.run(["git","config","user.email","41898282+github-actions[bot]@users.noreply.github.com"],check=True)
    subprocess.run(["git","add","data/graph.json"],check=True)
    if subprocess.run(["git","diff","--cached","--quiet"]).returncode:
        subprocess.run(["git","commit","-m","Refresh the rolling 30-day card-gift graph"],check=True)
        # No force push: a concurrent source change leaves the deployed snapshot intact.
        subprocess.run(["git","push","origin","HEAD:main"],check=True)
    commit = subprocess.check_output(["git","rev-parse","HEAD"],text=True).strip()
    # GITHUB_TOKEN commits do not automatically trigger Pages. Request its build.
    api("/pages/builds", "POST")
    for _ in range(60):
        time.sleep(10)
        latest = api("/pages/builds/latest")
        if latest.get("commit") == commit:
            if latest.get("status") == "built":
                print("Pages published the refreshed graph: " + commit)
                return
            if latest.get("status") == "errored":
                raise RuntimeError("Pages build failed: " + str(latest.get("error")))
    raise RuntimeError("Pages did not confirm the refreshed revision within ten minutes")

if __name__ == "__main__":
    publish()

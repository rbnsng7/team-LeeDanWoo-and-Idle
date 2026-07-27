from flask import Flask, render_template, send_from_directory

app = Flask(__name__)


@app.route("/")
def dashboard():
    # 연구 대시보드. GitHub Pages에서도 그대로 열리도록
    # index.html은 템플릿이 아니라 순수 정적 파일로 두고 서빙만 한다.
    return send_from_directory(app.root_path, "index.html")


@app.route("/me")
def me():
    # 원래의 자기소개 페이지 (templates/index.html)
    profile = {
        "name": "송예겸",
        "hobby": "LeetCode에서 알고리즘 문제 풀기",
        "likes": [
            "새로운 OS 설치하고 내 스타일로 세팅하기",
            "가상머신에서 게임핵이나 바이러스 실행시켜보기",
        ],
    }
    return render_template("index.html", profile=profile)


if __name__ == "__main__":
    # debug=True: 코드를 고치면 자동으로 다시 실행됩니다.
    app.run(debug=True)

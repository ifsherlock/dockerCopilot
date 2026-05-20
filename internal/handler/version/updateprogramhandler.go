package version

import (
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/onlyLTY/dockerCopilot/internal/logic/version"
	"github.com/onlyLTY/dockerCopilot/internal/svc"
	"github.com/onlyLTY/dockerCopilot/internal/utiles"
	"github.com/zeromicro/go-zero/rest/httpx"
)

func UpdateProgramHandler(svcCtx *svc.ServiceContext) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		l := version.NewUpdateProgramLogic(r.Context(), svcCtx)
		force := strings.TrimSpace(r.URL.Query().Get("force"))
		resp, err := l.UpdateProgram(force == "1" || strings.EqualFold(force, "true"))
		if err != nil {
			httpx.WriteJson(w, resp.Code, resp)
		} else {
			httpx.WriteJson(w, resp.Code, resp)
		}
	}
}

func scheduleSelfRestart(after time.Duration) error {
	seconds := int(after / time.Second)
	if seconds < 1 {
		seconds = 1
	}
	pid := os.Getpid()
	cmd := exec.Command("/bin/sh", "-c", fmt.Sprintf("sleep %d; kill -TERM %d >/dev/null 2>&1 || true", seconds, pid))
	cmd.Stdout = nil
	cmd.Stderr = nil
	return cmd.Start()
}

func UploadProgramHandler(svcCtx *svc.ServiceContext) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if err := r.ParseMultipartForm(512 << 20); err != nil {
			httpx.WriteJson(w, http.StatusBadRequest, map[string]interface{}{"code": 400, "msg": "解析上传文件失败: " + err.Error(), "data": map[string]interface{}{}})
			return
		}
		file, header, err := r.FormFile("file")
		if err != nil {
			httpx.WriteJson(w, http.StatusBadRequest, map[string]interface{}{"code": 400, "msg": "缺少上传文件 file", "data": map[string]interface{}{}})
			return
		}
		defer file.Close()

		filename := filepath.Base(header.Filename)
		lower := strings.ToLower(filename)
		if !(strings.HasSuffix(lower, ".tar.gz") || strings.HasSuffix(lower, ".tgz") || lower == "dockercopilot" || lower == "dockercopilot-new" || strings.Contains(lower, "dockercopilot")) {
			httpx.WriteJson(w, http.StatusBadRequest, map[string]interface{}{"code": 400, "msg": "请上传 dockerCopilot 二进制或 tar.gz 更新包", "data": map[string]interface{}{}})
			return
		}

		workDir := os.Getenv("WORKDIR")
		if workDir == "" {
			workDir = "."
		}
		uploadDir := filepath.Join(workDir, ".dockercopilot-upload")
		if err := os.MkdirAll(uploadDir, 0755); err != nil {
			httpx.WriteJson(w, http.StatusInternalServerError, map[string]interface{}{"code": 500, "msg": "创建上传目录失败: " + err.Error(), "data": map[string]interface{}{}})
			return
		}
		archivePath := filepath.Join(uploadDir, uuid.New().String()+"-"+filename)
		out, err := os.OpenFile(archivePath, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0600)
		if err != nil {
			httpx.WriteJson(w, http.StatusInternalServerError, map[string]interface{}{"code": 500, "msg": "保存上传文件失败: " + err.Error(), "data": map[string]interface{}{}})
			return
		}
		_, copyErr := io.Copy(out, file)
		closeErr := out.Close()
		if copyErr != nil || closeErr != nil {
			if copyErr == nil {
				copyErr = closeErr
			}
			httpx.WriteJson(w, http.StatusInternalServerError, map[string]interface{}{"code": 500, "msg": "写入上传文件失败: " + copyErr.Error(), "data": map[string]interface{}{}})
			return
		}

		taskID := uuid.New().String()
		svcCtx.UpdateProgress(taskID, svc.TaskProgress{TaskID: taskID, Percentage: 1, Name: "dockerCopilot", Message: "上传更新包已接收", DetailMsg: fmt.Sprintf("%s (%d bytes)", filename, header.Size), IsDone: false})
		go func() {
			defer os.Remove(archivePath)
			if runErr := utiles.UpdateProgramWithSource(svcCtx, taskID, utiles.ProgramUpdateSource{ArchivePath: archivePath, Filename: filename, Manual: true}); runErr != nil {
				svcCtx.UpdateProgress(taskID, svc.TaskProgress{TaskID: taskID, Percentage: 100, Name: "dockerCopilot", Message: "更新失败", DetailMsg: runErr.Error(), IsDone: true})
				return
			}
			if err := scheduleSelfRestart(5 * time.Second); err != nil {
				svcCtx.UpdateProgress(taskID, svc.TaskProgress{TaskID: taskID, Percentage: 100, Name: "dockerCopilot", Message: "更新失败", DetailMsg: "更新包已应用，但调度服务重启失败: " + err.Error(), IsDone: true})
				return
			}
			svcCtx.UpdateProgress(taskID, svc.TaskProgress{TaskID: taskID, Percentage: 100, Name: "dockerCopilot", Message: "更新完成，5 秒后重启服务...", DetailMsg: "上传包已应用，服务将自动重启并恢复连接", IsDone: true})
		}()

		httpx.WriteJson(w, http.StatusOK, map[string]interface{}{"code": 200, "msg": "success", "data": map[string]interface{}{"updated": true, "taskID": taskID}})
	}
}

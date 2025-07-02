// 路径映射计数器
let mappingCounter = 0;

// 页面加载时初始化
$(document).ready(function() {
    loadPlexServers();
    loadConfig();
    
    // 加载媒体库按钮点击事件
    $("#btn_load_sections").click(function() {
        const serverId = $("#plex_server_id").val();
        if (!serverId) {
            showNotification("请先选择Plex服务器", "warning");
            return;
        }
        
        // 显示加载状态
        $(this).html('<i class="fa fa-spinner fa-spin mr-2"></i> 加载中...').attr('disabled', true);
        
        pluginApi.get("related_plex_sections", { server_id: serverId }).then(response => {
            $(this).html('<i class="fa fa-refresh mr-2"></i> 加载媒体库').attr('disabled', false);
            
            if (response.success) {
                const sections = response.data;
                fillSectionsDropdown(sections);
                $("#sections_container").removeClass("hidden").addClass("flex flex-col");
                showNotification("媒体库加载成功", "success");
            } else {
                showNotification("加载媒体库失败: " + response.message, "error");
            }
        }).catch(error => {
            $(this).html('<i class="fa fa-refresh mr-2"></i> 加载媒体库').attr('disabled', false);
            showNotification("发生错误: " + error.message, "error");
        });
    });
    
    // 测试连接按钮点击事件
    $("#btn_test_connection").click(function() {
        const serverId = $("#plex_server_id").val();
        if (!serverId) {
            showNotification("请先选择Plex服务器", "warning");
            return;
        }
        
        // 显示加载状态
        $(this).html('<i class="fa fa-spinner fa-spin mr-1"></i> 测试中...').attr('disabled', true);
        
        pluginApi.get("related_plex_server", { server_id: serverId }).then(response => {
            $(this).html('<i class="fa fa-check-circle mr-1"></i> 测试连接').attr('disabled', false);
            
            if (response.success) {
                showNotification("连接测试成功", "success");
            } else {
                showNotification("连接测试失败: " + response.message, "error");
            }
        }).catch(error => {
            $(this).html('<i class="fa fa-check-circle mr-1"></i> 测试连接').attr('disabled', false);
            showNotification("发生错误: " + error.message, "error");
        });
    });
    
    // 添加路径映射按钮点击事件
    $("#btn_add_mapping").click(function() {
        addMappingEntry();
    });
    
    // 保存配置按钮点击事件
    $("#btn_save").click(function() {
        saveConfig();
    });
    
    // 取消按钮点击事件
    $("#btn_cancel").click(function() {
        loadConfig();
    });
});

// 加载Plex服务器列表
function loadPlexServers() {
    pluginApi.get("related_plex_servers").then(response => {
        if (response.success) {
            const servers = response.data;
            const select = $("#plex_server_id");
            select.empty();
            select.append('<option value="">-- 请选择 --</option>');
            
            servers.forEach(server => {
                select.append(`<option value="${server.id}">${server.name} (${server.url})</option>`);
            });
        } else {
            showNotification("获取Plex服务器列表失败: " + response.message, "error");
        }
    }).catch(error => {
        showNotification("发生错误: " + error.message, "error");
    });
}

// 填充媒体库下拉框
function fillSectionsDropdown(sections) {
    const select = $("#plex_section_id");
    select.empty();
    select.append('<option value="">-- 请选择 --</option>');
    
    sections.forEach(section => {
        // 仅显示类型为movie或show的媒体库
        if (section.type === "movie" || section.type === "show") {
            select.append(`<option value="${section.key}">${section.title} (${section.type === "movie" ? "电影" : "剧集"})</option>`);
        }
    });
}

// 添加路径映射条目
function addMappingEntry(localPath = "", plexPath = "") {
    const entryId = `mapping_${mappingCounter++}`;
    
    const entryHtml = `
        <div id="${entryId}" class="mapping-entry grid grid-cols-12 gap-3 mb-3 border border-gray-200 rounded-md p-3 bg-gray-50">
            <div class="col-span-5">
                <label class="block text-xs font-medium text-gray-700 mb-1">本地路径</label>
                <input type="text" class="w-full px-2 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition" 
                    placeholder="/mnt/cloudrive/Movies" value="${localPath}">
            </div>
            <div class="col-span-1 flex items-end justify-center">
                <span class="text-gray-500 font-medium">→</span>
            </div>
            <div class="col-span-5">
                <label class="block text-xs font-medium text-gray-700 mb-1">Plex服务器路径</label>
                <input type="text" class="w-full px-2 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition" 
                    placeholder="/data/media/Movies" value="${plexPath}">
            </div>
            <div class="col-span-1 flex items-end justify-center">
                <button class="remove-mapping bg-red-500 hover:bg-red-600 text-white p-1.5 rounded text-xs transition">
                    <i class="fa fa-times"></i>
                </button>
            </div>
        </div>
    `;
    
    $("#path_mappings_container").append(entryHtml);
    
    // 添加删除事件
    $(`#${entryId} .remove-mapping`).click(function() {
        $(`#${entryId}`).remove();
    });
}

// 加载配置
function loadConfig() {
    pluginApi.get("config").then(response => {
        if (response.success) {
            const config = response.data;
            
            // 填充基本配置
            $("#plex_server_id").val(config.plex_server_id || "");
            $("#plex_section_id").val(config.plex_section_id || "");
            $("#watch_directory").val(config.watch_directory || "");
            $("#scan_interval").val(config.scan_interval || 300);
            
            // 清空并重新添加路径映射
            $("#path_mappings_container").empty();
            const mappings = config.path_mappings || [];
            mappings.forEach(mapping => {
                addMappingEntry(mapping.local_path || "", mapping.plex_path || "");
            });
            
            // 如果已经选择了服务器，尝试加载媒体库
            if (config.plex_server_id) {
                $("#btn_load_sections").click();
            }
        } else {
            showNotification("加载配置失败: " + response.message, "error");
        }
    }).catch(error => {
        showNotification("发生错误: " + error.message, "error");
    });
}

// 保存配置
function saveConfig() {
    // 收集配置数据
    const config = {
        plex_server_id: $("#plex_server_id").val(),
        plex_section_id: $("#plex_section_id").val(),
        watch_directory: $("#watch_directory").val(),
        scan_interval: parseInt($("#scan_interval").val() || 300),
        path_mappings: []
    };
    
    // 收集路径映射
    $(".mapping-entry").each(function() {
        const localPath = $(this).find("input").eq(0).val();
        const plexPath = $(this).find("input").eq(1).val();
        
        if (localPath && plexPath) {
            config.path_mappings.push({
                local_path: localPath,
                plex_path: plexPath
            });
        }
    });
    
    // 验证配置
    if (!config.plex_server_id) {
        showNotification("请选择Plex服务器", "warning");
        return;
    }
    
    if (!config.plex_section_id) {
        showNotification("请选择媒体库", "warning");
        return;
    }
    
    if (!config.watch_directory) {
        showNotification("请设置监控目录", "warning");
        return;
    }
    
    if (config.scan_interval < 60) {
        showNotification("扫描间隔不能小于60秒", "warning");
        return;
    }
    
    // 保存配置
    pluginApi.post("config", config).then(response => {
        if (response.success) {
            showNotification("配置保存成功", "success");
        } else {
            showNotification("保存配置失败: " + response.message, "error");
        }
    }).catch(error => {
        showNotification("发生错误: " + error.message, "error");
    });
}

// 显示通知
function showNotification(message, type = "info") {
    // 创建通知元素
    const notification = $(`
        <div class="fixed bottom-4 right-4 px-4 py-2 rounded-md shadow-lg transform transition-all duration-300 translate-y-10 opacity-0 z-50 flex items-center">
            <i class="fa mr-2"></i>
            <span>${message}</span>
        </div>
    `);
    
    // 设置通知样式
    if (type === "success") {
        notification.addClass("bg-green-100 text-green-800 border-l-4 border-green-500");
        notification.find("i").addClass("fa-check-circle text-green-600");
    } else if (type === "error") {
        notification.addClass("bg-red-100 text-red-800 border-l-4 border-red-500");
        notification.find("i").addClass("fa-times-circle text-red-600");
    } else if (type === "warning") {
        notification.addClass("bg-yellow-100 text-yellow-800 border-l-4 border-yellow-500");
        notification.find("i").addClass("fa-exclamation-triangle text-yellow-600");
    } else {
        notification.addClass("bg-blue-100 text-blue-800 border-l-4 border-blue-500");
        notification.find("i").addClass("fa-info-circle text-blue-600");
    }
    
    // 添加到页面并显示
    $("body").append(notification);
    setTimeout(() => {
        notification.removeClass("translate-y-10 opacity-0");
    }, 10);
    
    // 自动关闭
    setTimeout(() => {
        notification.addClass("translate-y-10 opacity-0");
        setTimeout(() => {
            notification.remove();
        }, 300);
    }, 3000);
}

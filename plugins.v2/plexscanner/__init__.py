from plugins.v2.base import PluginV2Base, Event, EventType, PluginResult
import logging
import os
import time
import json
import requests
from datetime import datetime
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("plex_scanner_v2")

class PlexScanHandler(FileSystemEventHandler):
    """文件系统变化处理器"""
    def __init__(self, plugin):
        self.plugin = plugin
        
    def on_created(self, event):
        if not event.is_directory:
            logger.info(f"检测到新增文件: {event.src_path}")
            self.plugin.handle_file_change(event.src_path, "added")
    
    def on_modified(self, event):
        if not event.is_directory:
            logger.info(f"检测到文件修改: {event.src_path}")
            self.plugin.handle_file_change(event.src_path, "modified")
    
    def on_deleted(self, event):
        if not event.is_directory:
            logger.info(f"检测到文件删除: {event.src_path}")
            self.plugin.handle_file_change(event.src_path, "deleted")

class PlexScanner(PluginV2Base):
    """MoviePilot V2版Plex自动扫描插件"""
    def __init__(self):
        super().__init__()
        self.config = {}
        self.observer = None
        self.event_handler = None
        self.path_mappings = {}
        self.plex_servers = []
        self.watch_directory = ""
        self.scan_interval = 300
        
    def get_plugin_info(self):
        return {
            "name": "plex_scanner",
            "version": "1.0.0",
            "icon": "icon.svg",
            "description": "自动监控CloudDrive2挂载目录变化并触发Plex局部扫描",
            "author": "CodeEspresso",
            "category": "media"
        }
    
    async def init(self, config):
        self.config = config
        await self._load_plex_servers()
        self._load_config()
        self._start_watchdog()
        logger.info(f"Plex扫描插件初始化完成，监控目录: {self.watch_directory}")
    
    async def _load_plex_servers(self):
        try:
            self.plex_servers = await self.get_related_plex_servers()
            logger.info(f"已获取 {len(self.plex_servers)} 个Plex服务器配置")
        except Exception as e:
            logger.error(f"获取Plex服务器列表失败: {str(e)}")
    
    def _load_config(self):
        self.watch_directory = self.config.get("watch_directory", "")
        self.scan_interval = self.config.get("scan_interval", 300)
        self.path_mappings = self.config.get("path_mappings", [])
        
        self.mapping_dict = {}
        for mapping in self.path_mappings:
            local = mapping.get("local_path", "")
            plex = mapping.get("plex_path", "")
            if local and plex:
                self.mapping_dict[local] = plex
    
    def _start_watchdog(self):
        if not self.watch_directory or not os.path.exists(self.watch_directory):
            logger.warning(f"监控目录不存在: {self.watch_directory}，使用定时扫描模式")
            return
            
        try:
            self.event_handler = PlexScanHandler(self)
            self.observer = Observer()
            self.observer.schedule(self.event_handler, self.watch_directory, recursive=True)
            self.observer.start()
            logger.info(f"文件监控已启动，监控目录: {self.watch_directory}")
        except Exception as e:
            logger.error(f"启动文件监控失败: {str(e)}，使用定时扫描模式")
            self.observer = None
    
    def stop(self):
        if self.observer:
            self.observer.stop()
            self.observer.join()
        logger.info("Plex扫描插件已停止")
    
    def get_events(self):
        events = [
            Event(
                event_type=EventType.TIMER,
                interval=self.scan_interval,
                description="定时扫描目录变化"
            )
        ]
        
        if self.observer:
            events.append(
                Event(
                    event_type=EventType.FILE_CHANGED,
                    description="文件系统变化事件"
                )
            )
        return events
    
    async def handle_event(self, event):
        if event.type == EventType.TIMER:
            return self._scan_directory()
        elif event.type == EventType.FILE_CHANGED:
            file_path = event.data.get("path", "")
            change_type = event.data.get("type", "added")
            return self.handle_file_change(file_path, change_type)
        return PluginResult(success=True, message="事件已处理")
    
    def handle_file_change(self, file_path, change_type):
        if not file_path or (change_type != "deleted" and not os.path.exists(file_path)):
            return PluginResult(success=False, message="文件路径无效")
            
        try:
            mapped_path = self._map_path(file_path)
            if not mapped_path:
                logger.warning(f"无法映射路径: {file_path}")
                return PluginResult(success=False, message="路径映射失败")
                
            return self._trigger_plex_scan([mapped_path], change_type)
            
        except Exception as e:
            logger.error(f"处理文件变化时发生错误: {str(e)}")
            return PluginResult(success=False, message=str(e))
    
    def _scan_directory(self):
        if not self.watch_directory or not os.path.exists(self.watch_directory):
            return PluginResult(success=False, message="监控目录不存在")
            
        try:
            changed_files = self._detect_changes()
            if changed_files:
                logger.info(f"定时扫描检测到 {len(changed_files)} 个文件变化，触发Plex扫描")
                return self._trigger_plex_scan(changed_files)
            return PluginResult(success=True, message="未检测到文件变化")
            
        except Exception as e:
            logger.error(f"定时扫描失败: {str(e)}")
            return PluginResult(success=False, message=str(e))
    
    def _detect_changes(self):
        changed_files = []
        for root, _, files in os.walk(self.watch_directory):
            for file in files:
                file_path = os.path.join(root, file)
                changed_files.append(file_path)
        return changed_files
    
    def _map_path(self, local_path):
        for local_prefix, plex_prefix in self.mapping_dict.items():
            if local_path.startswith(local_prefix):
                return local_path.replace(local_prefix, plex_prefix)
        return local_path
    
    def _trigger_plex_scan(self, paths, change_type="added"):
        server_id = self.config.get("plex_server_id")
        section_id = self.config.get("plex_section_id")
        
        if not server_id or not section_id:
            return PluginResult(success=False, message="Plex服务器或媒体库未配置")
            
        valid_paths = list({p for p in paths if os.path.exists(p) or change_type == "deleted"})
        if not valid_paths:
            return PluginResult(success=True, message="无有效路径需要扫描")
            
        try:
            server = next((s for s in self.plex_servers if s.id == server_id), None)
            if not server:
                return PluginResult(success=False, message="找不到指定的Plex服务器")
                
            url = f"{server.url}/library/sections/{section_id}/refresh"
            params = {
                "path": ",".join([requests.utils.quote(p) for p in valid_paths]),
                "X-Plex-Token": server.token
            }
            
            logger.info(f"触发Plex扫描，路径: {', '.join(valid_paths[:3])}...")
            response = requests.get(url, params=params)
            
            if response.status_code == 200:
                logger.info("Plex扫描请求成功")
                return PluginResult(success=True, message="Plex扫描已触发")
            else:
                error_msg = f"Plex API错误: {response.status_code} - {response.text}"
                logger.error(error_msg)
                return PluginResult(success=False, message=error_msg)
                
        except Exception as e:
            logger.error(f"触发Plex扫描失败: {str(e)}")
            return PluginResult(success=False, message=str(e))
